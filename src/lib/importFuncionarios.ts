/**
 * Importação em massa de colaboradores (Excel ou CSV).
 *
 * O núcleo (`parseCsv`, `previewEmployeeRows`) é puro: recebe a planilha já
 * como matriz de células e as listas do banco, e devolve a prévia linha a
 * linha. A leitura do .xlsx (`readXlsxMatrix`) é a única parte que toca o
 * exceljs. Nada aqui grava no banco — quem grava é a rota de confirmação, que
 * revalida tudo de novo, porque as linhas voltam do navegador.
 *
 * Regra de ouro: quem já está cadastrado NUNCA é alterado pela importação.
 * Uma linha que bate com um colaborador existente vira "duplicado" e é
 * ignorada, sem sobrescrever nada.
 */
import ExcelJS from 'exceljs';
import { normalizeName, findDuplicate, type EmployeeTrack } from './employeeCreate';

export type Cell = string | number | boolean | Date | null | undefined;

export const MAX_IMPORT_EMPLOYEES = 1000;

export interface Lookup { id: string; name: string }

export type PreviewStatus = 'OK' | 'DUPLICADO' | 'ERRO';

export interface PreviewRow {
  /** Linha na planilha (cabeçalho = 1), para o RH achar e corrigir. */
  line: number;
  fullName: string;
  unitName: string;
  sectorName: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  /** ISO ao meio-dia local, ou null quando a planilha não trouxe data. */
  admissionDate: string | null;
  track: EmployeeTrack;
  unitId: string | null;
  sectorId: string | null;
  status: PreviewStatus;
  /** Motivo do erro ou do duplicado. */
  messages: string[];
  /** Não impedem a importação (ex.: "sem data de admissão"). */
  warnings: string[];
}

export interface PreviewResult {
  rows: PreviewRow[];
  /** Erros que invalidam a planilha inteira (ex.: coluna obrigatória ausente). */
  fileErrors: string[];
  counts: { total: number; ok: number; duplicado: number; erro: number };
}

// ---------------------------------------------------------------- leitura --

/**
 * CSV simples com aspas. O delimitador (`;`, `,` ou tab) é detectado na
 * primeira linha — o Excel em português salva com `;`.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Primeira aba do .xlsx como matriz de células (valores já resolvidos). */
export async function readXlsxMatrix(buffer: ArrayBuffer): Promise<Cell[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  if (sheet.rowCount > MAX_IMPORT_EMPLOYEES + 1) {
    throw new Error(`A planilha tem mais de ${MAX_IMPORT_EMPLOYEES} linhas. Divida em partes menores.`);
  }
  const out: Cell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: Cell[] = [];
    const last = Math.max(row.cellCount, 8);
    for (let c = 1; c <= last; c++) {
      const v = row.getCell(c).value as unknown;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
        if (Array.isArray(o.richText)) cells.push(o.richText.map((t) => t.text).join(''));
        else if (o.text !== undefined) cells.push(String(o.text));
        else if (o.result !== undefined) cells.push(o.result as Cell);
        else cells.push(null);
      } else cells.push(v as Cell);
    }
    out[n - 1] = cells;
  });
  return Array.from(out, (r) => r ?? []);
}

// ------------------------------------------------------------- validação --

const HEADERS: Record<'nome' | 'unidade' | 'setor' | 'cargo' | 'turno' | 'admissao' | 'tipo', string[]> = {
  nome: ['nome completo', 'nome', 'funcionario', 'colaborador'],
  unidade: ['unidade', 'loja'],
  setor: ['setor', 'area'],
  cargo: ['cargo', 'funcao', 'cargo/funcao', 'cargo / funcao'],
  turno: ['turno'],
  admissao: ['data de admissao', 'admissao', 'data admissao'],
  tipo: ['tipo', 'tipo de colaborador', 'trilha'],
};

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return '';
  return String(cell).trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data de calendário → ISO ao meio-dia local (evita o fuso virar o dia). */
function isoNoon(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d, 12, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date.toISOString();
}

/** Aceita data do Excel, serial numérico, dd/mm/aaaa, dd/mm/aa e aaaa-mm-dd. */
export function parseAdmissionDate(cell: Cell): { iso: string | null; error?: string } {
  if (cell === null || cell === undefined || cell === '') return { iso: null };
  let iso: string | null = null;
  if (cell instanceof Date) {
    // ExcelJS entrega a data como UTC à meia-noite: usar os campos UTC.
    iso = isoNoon(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  } else if (typeof cell === 'number') {
    const d = new Date(Math.round((cell - 25569) * 86400 * 1000));
    iso = isoNoon(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  } else {
    const s = String(cell).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (m) {
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      iso = isoNoon(year, Number(m[2]), Number(m[1]));
    } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
      iso = isoNoon(Number(m[1]), Number(m[2]), Number(m[3]));
    }
  }
  if (!iso) return { iso: null, error: `Data de admissão inválida: "${text(cell) || String(cell)}". Use dd/mm/aaaa.` };
  const year = new Date(iso).getFullYear();
  if (year < 1990) return { iso: null, error: 'Data de admissão anterior a 1990.' };
  if (new Date(iso).getTime() > Date.now() + 24 * 3600 * 1000) return { iso: null, error: 'Data de admissão no futuro.' };
  return { iso };
}

/** Acha na lista pelo nome: exato (sem acento) ou, se único, por conter um no outro. */
export function matchLookup(list: Lookup[], raw: string): { item: Lookup | null; ambiguous: boolean } {
  const key = normalizeName(raw);
  if (!key) return { item: null, ambiguous: false };
  const exact = list.find((l) => normalizeName(l.name) === key);
  if (exact) return { item: exact, ambiguous: false };
  const partial = list.filter((l) => {
    const n = normalizeName(l.name);
    return n.includes(key) || key.includes(n);
  });
  if (partial.length === 1) return { item: partial[0], ambiguous: false };
  return { item: null, ambiguous: partial.length > 1 };
}

function parseShift(raw: string): 'DIA' | 'NOITE' | null {
  const k = normalizeName(raw);
  if (!k || ['dia', 'diurno', 'manha', 'tarde', 'd'].includes(k)) return 'DIA';
  if (['noite', 'noturno', 'n'].includes(k)) return 'NOITE';
  return null;
}

function parseTrack(raw: string): EmployeeTrack | null {
  const k = normalizeName(raw);
  if (!k || ['ativo', 'ativos', 'antigo', 'colaborador ativo'].includes(k)) return 'ATIVO';
  if (['novo', 'novos', 'colaborador novo', 'experiencia'].includes(k)) return 'NOVO';
  return null;
}

export function previewEmployeeRows(
  matrix: Cell[][],
  ctx: {
    units: Lookup[];
    sectors: Lookup[];
    existing: { fullName: string; unitId: string }[];
  },
): PreviewResult {
  const empty = (fileErrors: string[]): PreviewResult => ({ rows: [], fileErrors, counts: { total: 0, ok: 0, duplicado: 0, erro: 0 } });
  if (matrix.length === 0) return empty(['Planilha vazia.']);

  const header = (matrix[0] ?? []).map((c) => normalizeName(text(c)));
  const col = (key: keyof typeof HEADERS) => header.findIndex((h) => HEADERS[key].includes(h));
  const idx = {
    nome: col('nome'), unidade: col('unidade'), setor: col('setor'), cargo: col('cargo'),
    turno: col('turno'), admissao: col('admissao'), tipo: col('tipo'),
  };
  const faltando = ([['nome', 'Nome completo'], ['unidade', 'Unidade'], ['setor', 'Setor']] as const)
    .filter(([k]) => idx[k] < 0)
    .map(([, label]) => label);
  if (faltando.length > 0) {
    return empty([`Coluna obrigatória ausente no cabeçalho: ${faltando.join(', ')}. Baixe o modelo para conferir.`]);
  }
  if (matrix.length - 1 > MAX_IMPORT_EMPLOYEES) {
    return empty([`A planilha tem mais de ${MAX_IMPORT_EMPLOYEES} linhas. Divida em partes menores.`]);
  }

  const rows: PreviewRow[] = [];
  // Quem já entrou nesta mesma importação, para pegar repetição dentro da planilha.
  const vistos: { fullName: string; unitId: string; line: number }[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const get = (c: number) => (c >= 0 ? r[c] : undefined);
    const fullName = text(get(idx.nome)).replace(/\s+/g, ' ');
    const unitName = text(get(idx.unidade));
    const sectorName = text(get(idx.setor));
    const cargoRaw = text(get(idx.cargo));
    // Linha totalmente vazia: planilhas costumam ter sobra em branco no fim.
    if (r.every((c) => text(c) === '' && !(c instanceof Date))) continue;

    const messages: string[] = [];
    const warnings: string[] = [];
    let status: PreviewStatus = 'OK';

    if (fullName.length < 2) messages.push('Nome completo vazio ou curto demais.');
    else if (fullName.length > 160) messages.push('Nome completo longo demais (máx. 160).');

    const unit = matchLookup(ctx.units, unitName);
    if (!unitName) messages.push('Unidade vazia.');
    else if (!unit.item) messages.push(unit.ambiguous ? `Unidade "${unitName}" é ambígua.` : `Unidade "${unitName}" não encontrada.`);

    const sector = matchLookup(ctx.sectors, sectorName);
    if (!sectorName) messages.push('Setor vazio.');
    else if (!sector.item) messages.push(sector.ambiguous ? `Setor "${sectorName}" é ambíguo.` : `Setor "${sectorName}" não encontrado.`);

    const shift = parseShift(text(get(idx.turno)));
    if (!shift) messages.push(`Turno inválido: "${text(get(idx.turno))}". Use Diurno ou Noturno.`);

    const track = parseTrack(text(get(idx.tipo)));
    if (!track) messages.push(`Tipo inválido: "${text(get(idx.tipo))}". Use Ativo ou Novo.`);

    const date = parseAdmissionDate(get(idx.admissao));
    if (date.error) messages.push(date.error);
    else if (!date.iso) {
      if (track === 'NOVO') messages.push('Colaborador novo precisa da data de admissão.');
      else warnings.push('Sem data de admissão — será registrada a data da importação.');
    }

    if (cargoRaw.length > 300) messages.push('Cargo longo demais (máx. 300).');
    const roleDescription = cargoRaw || sector.item?.name || sectorName;
    if (!cargoRaw) warnings.push('Sem cargo — usado o nome do setor.');

    if (messages.length > 0) {
      status = 'ERRO';
    } else if (unit.item) {
      const noBanco = findDuplicate(ctx.existing, { fullName, unitId: unit.item.id });
      const naPlanilha = vistos.find((v) => v.unitId === unit.item!.id && normalizeName(v.fullName) === normalizeName(fullName));
      if (noBanco) {
        status = 'DUPLICADO';
        messages.push('Já cadastrado nesta unidade — não será alterado.');
      } else if (naPlanilha) {
        status = 'DUPLICADO';
        messages.push(`Repetido na planilha (já aparece na linha ${naPlanilha.line}).`);
      } else {
        vistos.push({ fullName, unitId: unit.item.id, line: i + 1 });
      }
    }

    rows.push({
      line: i + 1,
      fullName, unitName, sectorName, roleDescription,
      shift: shift ?? 'DIA',
      admissionDate: date.iso,
      track: track ?? 'ATIVO',
      unitId: unit.item?.id ?? null,
      sectorId: sector.item?.id ?? null,
      status, messages, warnings,
    });
  }

  const counts = {
    total: rows.length,
    ok: rows.filter((r) => r.status === 'OK').length,
    duplicado: rows.filter((r) => r.status === 'DUPLICADO').length,
    erro: rows.filter((r) => r.status === 'ERRO').length,
  };
  if (rows.length === 0) return empty(['A planilha não tem nenhuma linha de colaborador.']);
  return { rows, fileErrors: [], counts };
}

/** Dia de hoje em dd/mm/aaaa — usado nos exemplos do modelo. */
export function exemploData(): string {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() - 1}`;
}
