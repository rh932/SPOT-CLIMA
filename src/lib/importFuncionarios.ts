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
  /** Aprendiz (setor "X/APRENDIZ" no cadastro geral): entra efetivado, sem experiência. */
  isApprentice: boolean;
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
  /** Avisos sobre o arquivo todo (unidade detectada, linhas inativas puladas...). */
  notes: string[];
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
  // Cadastro geral do DP: os ativos ficam na aba "ATIVOS" (as outras são exames, demitidos etc.).
  const sheet = workbook.worksheets.find((w) => normalizeName(w.name) === 'ativos') ?? workbook.worksheets[0];
  if (!sheet) return [];
  if (sheet.rowCount > MAX_IMPORT_EMPLOYEES + 10) {
    throw new Error(`A planilha tem mais de ${MAX_IMPORT_EMPLOYEES} linhas. Divida em partes menores.`);
  }
  const out: Cell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: Cell[] = [];
    const last = Math.min(Math.max(row.cellCount, 8), 40);
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

const HEADERS: Record<'nome' | 'unidade' | 'setor' | 'cargo' | 'turno' | 'admissao' | 'tipo' | 'horario' | 'status' | 'departamento', string[]> = {
  nome: ['nome completo', 'nome', 'funcionario', 'funcionarios', 'colaborador'],
  unidade: ['unidade', 'loja'],
  setor: ['setor', 'area'],
  cargo: ['cargo', 'cargo atual', 'funcao', 'cargo/funcao', 'cargo / funcao'],
  turno: ['turno'],
  admissao: ['data de admissao', 'admissao', 'data admissao'],
  tipo: ['tipo', 'tipo de colaborador', 'trilha'],
  horario: ['horario'],
  departamento: ['departamento'],
  status: ['status atual', 'status', 'situacao'],
};

/** No cadastro geral, quem foi admitido há até este tempo segue a trilha de colaborador novo. */
export const DIAS_COLABORADOR_NOVO = 90;

/** "17h00 às 00h55" → NOITE (começa às 17h ou depois); "08h10 às 16h30" → DIA. */
export function shiftFromSchedule(raw: string): 'DIA' | 'NOITE' {
  const m = normalizeName(raw).match(/(\d{1,2})\s*h/);
  if (!m) return 'DIA';
  const h = Number(m[1]);
  return h >= 17 || h < 5 ? 'NOITE' : 'DIA';
}

/** Setor do cadastro geral ("COZINHA/APRENDIZ") → setor puro + marca de aprendiz. */
function splitApprentice(raw: string): { sector: string; apprentice: boolean } {
  const m = raw.match(/^(.*?)\s*\/\s*aprendiz\s*$/i);
  return m ? { sector: m[1].trim(), apprentice: true } : { sector: raw, apprentice: false };
}

/** Unidade pelo nome do arquivo ("... - PP C.xlsx", "... - JK..xlsx"). */
export function inferUnitFromFileName(fileName: string, units: Lookup[]): Lookup | null {
  const k = ` ${normalizeName(fileName).replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, ' ')} `;
  for (const u of units) {
    const un = normalizeName(u.name).replace(/[^a-z0-9]+/g, ' ');
    if (un && k.includes(` ${un} `)) return u;
  }
  if (/ pp /.test(k)) return units.find((u) => normalizeName(u.name).includes('paulista')) ?? null;
  return null;
}

/** Palavras do cargo/departamento que indicam cada subsetor ("Salão - Bar", "Administração - RH"...). */
const SUBSECTOR_HINTS: [RegExp, RegExp][] = [
  [/\bbar\b/, /\bbar(man|woman|tender)?\b/],
  [/\bgerente\b/, /\bgerente\b/],
  [/\batendimento\b/, /\bgarcon(s|ete|etes)?\b|\batendimento\b/],
  [/\brh\b/, /\brh\b|recursos humanos/],
  [/\bfinanceiro\b/, /\bfinanceir[oa]\b/],
  [/compras|almoxarifado/, /compras|almoxarif/],
  [/manutencao/, /manutencao/],
];

/**
 * Setor genérico do cadastro geral (SALÃO, ADM) que tem vários subsetores no
 * sistema: o cargo (peso 2) e o departamento (peso 1) escolhem. Empate ou nenhuma
 * pista = não adivinha (volta null e a linha vira "setor ambíguo").
 */
function pickSectorByRole(list: Lookup[], sectorName: string, role: string, department = ''): Lookup | null {
  const key = normalizeName(sectorName);
  const cands = list.filter((l) => normalizeName(l.name).includes(key));
  if (cands.length < 2) return null;
  const cargo = normalizeName(role);
  const depto = normalizeName(department);
  const scored = cands.map((c) => {
    const n = normalizeName(c.name);
    let score = 0;
    for (const [sectorRe, textRe] of SUBSECTOR_HINTS) {
      if (!sectorRe.test(n)) continue;
      if (textRe.test(cargo)) score += 2;
      if (textRe.test(depto)) score += 1;
    }
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? 0) ? scored[0].c : null;
}

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
    /** Unidade da planilha quando ela não tem coluna "Unidade" (cadastro geral de uma loja). */
    defaultUnit?: Lookup | null;
  },
): PreviewResult {
  const empty = (fileErrors: string[]): PreviewResult => ({ rows: [], fileErrors, notes: [], counts: { total: 0, ok: 0, duplicado: 0, erro: 0 } });
  if (matrix.length === 0) return empty(['Planilha vazia.']);

  // O cadastro geral do DP tem uma linha de títulos solta acima do cabeçalho (JK): procura nas primeiras linhas.
  let headerRow = 0;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    if ((matrix[i] ?? []).some((c) => HEADERS.nome.includes(normalizeName(text(c))))) { headerRow = i; break; }
  }
  const header = (matrix[headerRow] ?? []).map((c) => normalizeName(text(c)));
  const col = (key: keyof typeof HEADERS) => header.findIndex((h) => HEADERS[key].includes(h));
  const idx = {
    nome: col('nome'), unidade: col('unidade'), setor: col('setor'), cargo: col('cargo'),
    turno: col('turno'), admissao: col('admissao'), tipo: col('tipo'),
    horario: col('horario'), status: col('status'), departamento: col('departamento'),
  };
  const faltando: string[] = ([['nome', 'Nome completo'], ['setor', 'Setor']] as const)
    .filter(([k]) => idx[k] < 0)
    .map(([, label]) => label);
  if (idx.unidade < 0 && !ctx.defaultUnit) faltando.push('Unidade');
  if (faltando.length > 0) {
    return empty([
      `Coluna obrigatória ausente no cabeçalho: ${faltando.join(', ')}. Baixe o modelo para conferir`
      + (idx.unidade < 0 ? ', ou escolha a unidade da planilha.' : '.'),
    ]);
  }
  if (matrix.length - 1 - headerRow > MAX_IMPORT_EMPLOYEES) {
    return empty([`A planilha tem mais de ${MAX_IMPORT_EMPLOYEES} linhas. Divida em partes menores.`]);
  }
  const cadastroGeral = idx.status >= 0 || idx.horario >= 0;

  const rows: PreviewRow[] = [];
  const notes: string[] = [];
  if (idx.unidade < 0 && ctx.defaultUnit) notes.push(`Unidade da planilha: ${ctx.defaultUnit.name}.`);
  let inativos = 0;
  // Quem já entrou nesta mesma importação, para pegar repetição dentro da planilha.
  const vistos: { fullName: string; unitId: string; line: number }[] = [];

  for (let i = headerRow + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const get = (c: number) => (c >= 0 ? r[c] : undefined);
    const fullName = text(get(idx.nome)).replace(/\s+/g, ' ');
    const unitName = idx.unidade >= 0 ? text(get(idx.unidade)) : (ctx.defaultUnit?.name ?? '');
    const setorBruto = text(get(idx.setor));
    const cargoRaw = text(get(idx.cargo));
    // Linha totalmente vazia: planilhas costumam ter sobra em branco no fim.
    if (r.every((c) => text(c) === '' && !(c instanceof Date))) continue;
    // Cadastro geral: só "ATIVO" entra (inativo, afastado etc. ficam de fora).
    if (idx.status >= 0 && text(get(idx.status)) && normalizeName(text(get(idx.status))) !== 'ativo') { inativos++; continue; }
    // Linhas de apoio sem nome (totais, notas) não são colaboradores.
    if (cadastroGeral && !fullName) continue;

    const messages: string[] = [];
    const warnings: string[] = [];
    let status: PreviewStatus = 'OK';

    if (fullName.length < 2) messages.push('Nome completo vazio ou curto demais.');
    else if (fullName.length > 160) messages.push('Nome completo longo demais (máx. 160).');

    const unit = idx.unidade < 0 && ctx.defaultUnit
      ? { item: ctx.defaultUnit as Lookup | null, ambiguous: false }
      : matchLookup(ctx.units, unitName);
    if (!unitName) messages.push('Unidade vazia.');
    else if (!unit.item) messages.push(unit.ambiguous ? `Unidade "${unitName}" é ambígua.` : `Unidade "${unitName}" não encontrada.`);

    // "COZINHA/APRENDIZ" = setor Cozinha + aprendiz.
    const { sector: sectorName, apprentice } = splitApprentice(setorBruto);
    const isApprentice = apprentice;
    let sector = matchLookup(ctx.sectors, sectorName);
    if (!sector.item && sector.ambiguous) {
      const porCargo = pickSectorByRole(ctx.sectors, sectorName, cargoRaw, text(get(idx.departamento)));
      if (porCargo) sector = { item: porCargo, ambiguous: false };
    }
    if (!sectorName) messages.push('Setor vazio.');
    else if (!sector.item) messages.push(sector.ambiguous ? `Setor "${sectorName}" é ambíguo.` : `Setor "${sectorName}" não encontrado.`);

    const turnoTexto = text(get(idx.turno));
    const shift = turnoTexto || idx.horario < 0 ? parseShift(turnoTexto) : shiftFromSchedule(text(get(idx.horario)));
    if (!shift) messages.push(`Turno inválido: "${turnoTexto}". Use Diurno ou Noturno.`);

    let track = parseTrack(text(get(idx.tipo)));
    if (!track) messages.push(`Tipo inválido: "${text(get(idx.tipo))}". Use Ativo ou Novo.`);

    const date = parseAdmissionDate(get(idx.admissao));
    if (date.error) messages.push(date.error);
    else if (!date.iso) {
      if (track === 'NOVO') messages.push('Colaborador novo precisa da data de admissão.');
      else warnings.push('Sem data de admissão — será registrada a data da importação.');
    }
    // Cadastro geral não tem coluna de tipo: admitido há pouco tempo ainda está no treinamento/experiência.
    if (cadastroGeral && idx.tipo < 0 && date.iso && !isApprentice) {
      const dias = (Date.now() - new Date(date.iso).getTime()) / 86_400_000;
      if (dias <= DIAS_COLABORADOR_NOVO) {
        track = 'NOVO';
        warnings.push(`Admitido há ${Math.max(0, Math.floor(dias))} dia(s): entra como colaborador novo (experiência).`);
      }
    }
    if (isApprentice) warnings.push('Aprendiz: entra efetivado, sem avaliação de experiência.');

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
      fullName, unitName, sectorName, roleDescription, isApprentice,
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
  if (inativos > 0) notes.push(`${inativos} linha(s) com status diferente de ATIVO foram puladas.`);
  return { rows, fileErrors: [], notes, counts };
}

/** Dia de hoje em dd/mm/aaaa — usado nos exemplos do modelo. */
export function exemploData(): string {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() - 1}`;
}
