/**
 * Importa o histórico da avaliação de experiência para o Spot Clima:
 *
 * 1. os admitidos do ano (padrão 2026) do "Quadro de Admissões e Demissões"
 *    do DP, mais quem tiver resposta no Forms mesmo tendo entrado antes;
 * 2. TODAS as respostas do Google Forms "AVALIAÇÃO DE DESEMPENHO - RH SPOT";
 * 3. os desligamentos da aba "DEMISSÕES - JK E PP" (motivo e data);
 * 4. uma conta de Gestor para cada avaliador listado no Forms, com escopo de
 *    loja, setor e turno — as senhas saem numa planilha para o RH distribuir.
 *
 * Por padrão só MOSTRA o que faria (prévia). Grava apenas com --gravar, numa
 * transação única: ou entra tudo, ou nada. Pode rodar de novo sem duplicar
 * (funcionário casa por nome + admissão; avaliação pelo carimbo do Forms;
 * gestor pelo e-mail — conta que já existe não tem a senha trocada).
 *
 *   npx tsx scripts/import-experiencia.ts --forms "<respostas.csv>" [--planilha "<quadro.xlsx>"] [--ano 2026]
 *   npx tsx scripts/import-experiencia.ts --forms "<respostas.csv>" --gravar --senhas "<acessos.xlsx>"
 *   --sem-banco   monta o plano só com os arquivos (não lê o banco)
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/lib/password';
import {
  assertFormsHeader, evaluatorExit, mergeWithExisting, normName, parseCsv, parseFormsRow, planEmployee, planEvaluators,
  sectorTagFrom, unitTagFrom, evaluatorDisplayName, type ExistingEmployee, type FormsResponse, type MergeResult,
  type PlannedEmployee, type PlannedEvaluator, type SectorTag, type SheetAdmission, type SheetTermination, type UnitTag,
} from '../src/lib/importExperiencia';
import { TERMINATION_LABELS } from '../src/lib/termination';

const PLANILHA_PADRAO =
  'G:/Drives compartilhados/PTA - DP/DEPARTAMENTO PESSOAL/ADMISSÃO - RESCISÃO/QUADRO DE ADMISSÕES E DEMISSÕES/Quadro de Admissões e Demissões..xlsx';

/**
 * Opções da pergunta "Nome:" do Forms, copiadas do formulário em 29/09/2026.
 * O CSV só traz quem já respondeu; os gestores que ainda não avaliaram
 * ninguém também ganham conta.
 */
const GESTORES_DO_FORMS: { label: string; unit: UnitTag }[] = [
  ...[
    'ANDRÉ PURDIE COSTA (SALÃO JK)', 'RAPHAEL SOBREIRA RAMIRES (SALÃO JK)', 'HAMZA EL HENNAWI (SALÃO JK)',
    'JOÃO GUILHERME FERNANDES FIGUEIREDO MOURA (SALÃO JK)', 'DACIO ROBERTO DA SILVA CARVALHO (COZINHA JK)',
    'DIEGO DE LUCENA CHAVES (COZINHA JK)', 'JANIO VIEIRA DOS SANTOS (COZINHA JK)', 'LEANDRO DELGADO E SOUZA (COZINHA JK)',
    'ALAN MATHEUS (ADM)', 'HAMILTON OLIVEIRA (ADM)', 'DAVID PIRES DOS SANTOS (ADM)', 'MARCIO NUNES (ADM - JK)',
  ].map((label) => ({ label, unit: 'JK' as const })),
  ...[
    'BRUNO RODRIGUES ROSA FRASCINO (SALÃO PP)', 'JULIA DUTRA SARMENTO RITO (SALÃO PP)', 'RENE ITALO ALMEIDA SANTOS (SALÃO PP)',
    'MARCOS DE JESUS SOARES (COZINHA PP)', 'DAVI OLIVEIRA DA SILVA (COZINHA PP)', 'VICTOR FERREIRA DA SILVA PADILHA (COZINHA PP)',
    'CRISTIANO COSTA SILVA (COZINHA PP)', 'MARCIO NUNES (ADM)', 'GUILHERME REGIS (SALÃO PP)', 'ALAN MATHEUS (ADM)',
    'DAVID PIRES DOS SANTOS (ADM)', 'MARCIO NUNES (ADM - PP)',
  ].map((label) => ({ label, unit: 'PP' as const })),
];

// ------------------------------------------------------------------

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (nome: string) => process.argv.includes(`--${nome}`);

type Cell = ExcelJS.CellValue;
function valor(v: Cell): unknown {
  if (v && typeof v === 'object') {
    if ('result' in v) return (v as { result: unknown }).result;
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as { text: string }).text;
  }
  return v;
}
const texto = (v: Cell): string | null => {
  const x = valor(v);
  if (x === null || x === undefined) return null;
  if (x instanceof Date) return null;
  const s = String(x).trim();
  return s ? s : null;
};
const data = (v: Cell): Date | null => {
  const x = valor(v);
  if (x instanceof Date && !Number.isNaN(x.getTime())) {
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 12));
  }
  return null;
};

async function lerPlanilha(caminho: string): Promise<{ admissoes: SheetAdmission[]; demissoes: SheetTermination[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);

  const wsA = wb.getWorksheet('ADMISSÕES - JK E PP');
  if (!wsA) throw new Error('Aba "ADMISSÕES - JK E PP" não encontrada.');
  // Colunas pelo cabeçalho, não pela posição: a planilha já ganhou colunas antes.
  let cab = 0;
  const col: Record<string, number> = {};
  wsA.eachRow((r, i) => {
    if (cab) return;
    r.eachCell((c, n) => {
      const t = normName(texto(c.value));
      if (t === 'FUNCIONARIO') cab = i;
      if (t) col[t] = n;
    });
  });
  if (!cab) throw new Error('Cabeçalho "FUNCIONÁRIO" não encontrado na aba de admissões.');
  for (const k of ['FUNCIONARIO', 'LOJA', 'SETOR', 'CARGO', 'ADMISSAO', 'CONCLUSAO']) {
    if (!col[k]) throw new Error(`Coluna ${k} não encontrada (achadas: ${Object.keys(col).join(', ')}).`);
  }
  // "AVALIAÇÃO 1ºPERÍODO" e "AVALIAÇÃO 2ºPERÍODO": normName tira os dígitos,
  // então as duas viram o mesmo nome — vale a ordem das colunas.
  const avaliacoes: number[] = [];
  wsA.getRow(cab).eachCell((c, n) => { if (normName(texto(c.value)).startsWith('AVALIACAO')) avaliacoes.push(n); });
  const [aval1, aval2] = avaliacoes;

  const admissoes: SheetAdmission[] = [];
  wsA.eachRow((r, i) => {
    if (i <= cab) return;
    const nome = texto(r.getCell(col.FUNCIONARIO).value);
    const adm = data(r.getCell(col.ADMISSAO).value);
    if (!nome || !adm) return;
    const turno = normName(texto(r.getCell(col.TURNO).value));
    admissoes.push({
      row: i,
      name: nome.replace(/\s+/g, ' '),
      unit: unitTagFrom(texto(r.getCell(col.LOJA).value) ?? ''),
      sector: sectorTagFrom(texto(r.getCell(col.SETOR).value) ?? ''),
      role: (texto(r.getCell(col.CARGO).value) ?? '').replace(/\s+/g, ' '),
      hours: texto(r.getCell(col.HORA).value),
      shift: turno === 'NOITE' ? 'NOITE' : turno === 'DIA' ? 'DIA' : null,
      admission: adm,
      eval1: aval1 ? texto(r.getCell(aval1).value) : null,
      eval2: aval2 ? texto(r.getCell(aval2).value) : null,
      conclusion: texto(r.getCell(col.CONCLUSAO).value),
    });
  });

  const wsD = wb.getWorksheet('DEMISSÕES - JK E PP');
  if (!wsD) throw new Error('Aba "DEMISSÕES - JK E PP" não encontrada.');
  const demissoes: SheetTermination[] = [];
  wsD.eachRow((r, i) => {
    // A aba mudou de layout com o tempo: o nome está em B nas linhas novas e
    // em C nas antigas. É a primeira célula de texto longa antes da loja.
    const celulas = [2, 3, 4, 5, 6, 7].map((n) => r.getCell(n).value);
    const iLoja = celulas.findIndex((c) => ['JK', 'PP'].includes(normName(texto(c))));
    if (iLoja < 1) return;
    const nome = texto(celulas[iLoja - 1]);
    const motivo = texto(celulas[iLoja + 2]);
    const saida = data(celulas[iLoja + 3]);
    if (!nome || !motivo || normName(nome) === 'FUNCIONARIO') return;
    demissoes.push({ row: i, name: nome, unit: unitTagFrom(texto(celulas[iLoja]) ?? ''), reasonText: motivo, date: saida });
  });

  return { admissoes, demissoes };
}

function lerForms(caminho: string): FormsResponse[] {
  const linhas = parseCsv(fs.readFileSync(caminho, 'utf8'));
  const cab = linhas.shift();
  if (!cab) throw new Error('CSV vazio.');
  assertFormsHeader(cab);
  return linhas.map((l, i) => {
    try { return parseFormsRow(l); } catch (e) {
      throw new Error(`Linha ${i + 2} do CSV: ${(e as Error).message}`);
    }
  });
}

function senhaAleatoria(): string {
  // Sem 0/O/1/l/I, para ninguém errar ao digitar do papel.
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
const STATUS: Record<string, string> = {
  AWAITING_PERIOD_1: 'Aguardando 1º ciclo', AWAITING_PERIOD_2: 'Aguardando 2º ciclo', HIRED: 'Efetivado', TERMINATED: 'Desligado',
};

// ------------------------------------------------------------------

async function main() {
  const formsPath = arg('forms');
  if (!formsPath) throw new Error('Informe --forms <respostas.csv> (Forms → Respostas → ⋮ → Baixar respostas).');
  const planilhaPath = arg('planilha') ?? PLANILHA_PADRAO;
  const ano = Number(arg('ano') ?? 2026);
  const gravar = flag('gravar');
  const semBanco = flag('sem-banco');
  const senhasPath = arg('senhas');
  if (gravar && !senhasPath) throw new Error('Com --gravar, informe --senhas <arquivo.xlsx> para as senhas dos gestores novos.');

  const { admissoes, demissoes } = await lerPlanilha(planilhaPath);
  const respostas = lerForms(formsPath);

  // Quem entra: admitido no ano + quem tem resposta no Forms. Se o nome se
  // repete na planilha (saiu e voltou), vale a admissão mais recente que não
  // é posterior à resposta.
  const porNome = new Map<string, SheetAdmission[]>();
  for (const a of admissoes) porNome.set(normName(a.name), [...(porNome.get(normName(a.name)) ?? []), a]);
  const respostasPorAdmissao = new Map<SheetAdmission, FormsResponse[]>();
  const semCadastro: FormsResponse[] = [];
  for (const r of respostas) {
    const candidatos = (porNome.get(normName(r.employeeName)) ?? [])
      .filter((a) => a.admission.getTime() <= r.submittedAt.getTime())
      .sort((a, b) => b.admission.getTime() - a.admission.getTime());
    const alvo = candidatos[0];
    if (!alvo) { semCadastro.push(r); continue; }
    respostasPorAdmissao.set(alvo, [...(respostasPorAdmissao.get(alvo) ?? []), r]);
  }
  const selecionados = admissoes.filter((a) => a.admission.getUTCFullYear() === ano || respostasPorAdmissao.has(a));
  // A saída de um vínculo antigo não pode desligar o novo: cada admissão só
  // enxerga as saídas até a próxima admissão da mesma pessoa.
  const proximaAdmissao = (a: SheetAdmission) => (porNome.get(normName(a.name)) ?? [])
    .filter((b) => b.admission.getTime() > a.admission.getTime())
    .sort((x, y) => x.admission.getTime() - y.admission.getTime())[0]?.admission ?? null;

  const planos: PlannedEmployee[] = selecionados.map((a) =>
    planEmployee(a, respostasPorAdmissao.get(a) ?? [], demissoes, proximaAdmissao(a)));

  const gestoresTodos = planEvaluators(
    GESTORES_DO_FORMS,
    planos.flatMap((p) => p.evaluations.map((e) => ({
      label: e.response.evaluatorLabel, unit: p.sheet.unit, sector: p.sheet.sector, shift: p.shift,
    }))),
  );
  const gestorDoRotulo = (rotulo: string) => gestoresTodos.find((g) => normName(g.name) === normName(evaluatorDisplayName(rotulo)));
  // O Forms ainda lista quem já saiu. Esses não ganham conta (nem senha na
  // planilha de acessos); as avaliações que fizeram guardam só o nome.
  const ultimaAvaliacao = (g: PlannedEvaluator) => planos
    .flatMap((p) => p.evaluations)
    .filter((e) => gestorDoRotulo(e.response.evaluatorLabel) === g)
    .reduce<Date | null>((max, e) => (!max || e.response.submittedAt > max ? e.response.submittedAt : max), null);
  const gestoresDesligados = new Map(gestoresTodos.flatMap((g) => {
    const saida = evaluatorExit(g.name, admissoes, demissoes, ultimaAvaliacao(g));
    return saida ? [[g.email, saida] as const] : [];
  }));
  const gestores = gestoresTodos.filter((g) => !gestoresDesligados.has(g.email));

  // ---------------- prévia (arquivos) ----------------
  const cont = (f: (p: PlannedEmployee) => boolean) => planos.filter(f).length;
  console.log(`\nPlanilha: ${admissoes.length} admissões lidas, ${demissoes.length} desligamentos lidos.`);
  console.log(`Forms: ${respostas.length} respostas; ${respostas.length - semCadastro.length} casaram com a planilha.`);
  if (semCadastro.length) {
    console.log('  SEM CADASTRO NA PLANILHA:', semCadastro.map((r) => `${r.employeeName} (${r.submittedAt.toISOString().slice(0, 10)})`).join('; '));
  }
  console.log(`\nFuncionários a importar: ${planos.length} (${cont((p) => p.sheet.admission.getUTCFullYear() === ano)} admitidos em ${ano} + ${cont((p) => p.sheet.admission.getUTCFullYear() !== ano)} de antes, com resposta no Forms)`);
  for (const s of ['AWAITING_PERIOD_1', 'AWAITING_PERIOD_2', 'HIRED', 'TERMINATED']) {
    console.log(`  ${STATUS[s].padEnd(22)} ${cont((p) => p.status === s && !p.isApprentice)}`);
  }
  console.log(`  ${'Aprendiz'.padEnd(22)} ${cont((p) => p.isApprentice && p.status !== 'TERMINATED')} (+ ${cont((p) => p.isApprentice && p.status === 'TERMINATED')} aprendizes desligados)`);
  console.log(`Avaliações: ${planos.reduce((n, p) => n + p.evaluations.length, 0)}`);
  const motivos = new Map<string, number>();
  for (const p of planos) if (p.termination) motivos.set(TERMINATION_LABELS[p.termination.reason], (motivos.get(TERMINATION_LABELS[p.termination.reason]) ?? 0) + 1);
  console.log('Desligamentos por motivo:', [...motivos].map(([k, v]) => `${k}: ${v}`).join(' · '));

  console.log(`\nGestores (${gestores.length}):`);
  for (const g of gestores) {
    console.log(`  ${g.name.padEnd(42)} ${g.email.padEnd(30)} ${[...g.units].join('+').padEnd(6)} ${[...g.sectors].join('+').padEnd(16)} ${[...g.shifts].join('+')}`);
  }
  if (gestoresDesligados.size) {
    console.log(`\nGESTORES DO FORMS QUE JÁ SAÍRAM (sem conta): ${gestoresDesligados.size}`);
    for (const [email, s] of gestoresDesligados) {
      console.log(`  ${email.padEnd(30)} saída ${iso(s.date)} · ${s.reasonText.trim()} (aba de demissões, linha ${s.row})`);
    }
  }

  console.log('\nFuncionários:');
  for (const p of planos) {
    const av = p.evaluations.map((e) => `${e.period === 'FIRST' ? '1º' : '2º'}${e.cycleNumber > 1 ? `(${e.cycleNumber}ª)` : ''} ${iso(e.evaluationDate)} ${e.response.conclusion}`).join(', ');
    const sai = p.termination ? ` · saída ${iso(p.termination.date)} ${TERMINATION_LABELS[p.termination.reason]}` : '';
    console.log(`  L${p.sheet.row} ${p.sheet.name} · ${p.sheet.unit} ${p.sheet.sector} · ${p.shift}(${p.shiftSource}) · adm ${iso(p.sheet.admission)} · ${p.isApprentice ? 'APRENDIZ ' : ''}${STATUS[p.status]}${sai}${av ? ` · ${av}` : ''}`);
    for (const a of p.avisos) console.log(`      ! ${a}`);
  }

  const semLojaOuSetor = planos.filter((p) => !p.sheet.unit || !p.sheet.sector);
  if (semLojaOuSetor.length) {
    console.log('\nSEM LOJA OU SETOR RECONHECIDO:', semLojaOuSetor.map((p) => `L${p.sheet.row} ${p.sheet.name}`).join('; '));
  }

  if (semBanco) return;

  // ---------------- banco ----------------
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    // A prévia roda antes da migração 0016 (colunas de importação); a gravação não.
    const { rows: colunas } = await pool.query(
      "select 1 from information_schema.columns where table_name = 'probationary_employees' and column_name = 'previous_status'",
    );
    const migrado = colunas.length > 0;
    if (!migrado) {
      console.log('\nAVISO: a migração 0016_experiencia_importacao ainda não foi aplicada neste banco (npm run db:migrate).');
      if (gravar) throw new Error('Aplique a migração antes de gravar: npm run db:migrate');
    }

    const [units, sectors, admins, existentesBrutos] = await Promise.all([
      db.query.units.findMany({ columns: { id: true, name: true } }),
      db.query.sectors.findMany({ columns: { id: true, name: true } }),
      db.query.admins.findMany({
        columns: { id: true, email: true, name: true, role: true },
        with: {
          scopedUnits: { columns: { unitId: true } },
          scopedSectors: { columns: { sectorId: true } },
          scopedShifts: { columns: { shift: true } },
        },
      }),
      migrado
        ? db.query.probationaryEmployees.findMany({
          with: { evaluations: { columns: { period: true, cycleNumber: true, conclusion: true, evaluationDate: true, externalId: true } } },
        })
        // Antes da migração as colunas novas não existem: só as de sempre.
        : db.query.probationaryEmployees.findMany({
          columns: {
            id: true, fullName: true, admissionDate: true, roleDescription: true, sectorId: true, unitId: true,
            shift: true, status: true, period1DueDate: true, period2DueDate: true,
          },
          with: { evaluations: { columns: { period: true, cycleNumber: true, conclusion: true, evaluationDate: true } } },
        }),
    ]);
    const existentes: ExistingEmployee[] = (existentesBrutos as Record<string, unknown>[]).map((e) => {
      const r = e as unknown as ExistingEmployee & { evaluations: (ExistingEmployee['evaluations'][number] & { externalId?: string | null })[] };
      return {
        ...r,
        isApprentice: r.isApprentice ?? false,
        terminationReason: r.terminationReason ?? null,
        terminationDate: r.terminationDate ?? null,
        terminationNotes: r.terminationNotes ?? null,
        previousStatus: r.previousStatus ?? null,
        evaluations: r.evaluations.map((ev) => ({ ...ev, externalId: ev.externalId ?? null })),
      };
    });

    const unidade = (t: UnitTag) => {
      const achadas = units.filter((u) => unitTagFrom(u.name) === t);
      if (achadas.length !== 1) throw new Error(`Unidade ${t}: ${achadas.length} cadastros casam (${units.map((u) => u.name).join(', ')}).`);
      return achadas[0].id;
    };
    const setor = (t: SectorTag) => {
      const achados = sectors.filter((s) => sectorTagFrom(s.name) === t);
      if (achados.length !== 1) throw new Error(`Setor ${t}: ${achados.length} cadastros casam (${sectors.map((s) => s.name).join(', ')}).`);
      return achados[0].id;
    };
    // O sistema divide o Salão em "Salão - Bar", "Salão - Atendimento" e
    // "Salão - Gerente"; a planilha só diz SALÃO. Quem decide é o cargo.
    const salao = (parte: 'BAR' | 'ATENDIMENTO' | 'GERENTE') => {
      const s = sectors.find((x) => sectorTagFrom(x.name) === 'SALAO' && normName(x.name).includes(parte));
      if (!s) throw new Error(`Setor "Salão - ${parte}" não encontrado (${sectors.map((x) => x.name).join(', ')}).`);
      return s.id;
    };
    const temSalaoDividido = sectors.filter((x) => sectorTagFrom(x.name) === 'SALAO').length > 1;
    const tagsUsadas = {
      units: new Set<UnitTag>([...planos.map((p) => p.sheet.unit!), ...gestores.flatMap((g) => [...g.units])].filter(Boolean)),
      sectors: new Set<SectorTag>([...planos.map((p) => p.sheet.sector!), ...gestores.flatMap((g) => [...g.sectors])].filter(Boolean)),
    };
    const unitId = new Map([...tagsUsadas.units].map((t) => [t, unidade(t)]));
    const sectorId = new Map<SectorTag, string>([...tagsUsadas.sectors].filter((t) => t !== 'SALAO' || !temSalaoDividido).map((t) => [t, setor(t)]));
    const setorDoFuncionario = (p: PlannedEmployee) => {
      if (p.sheet.sector !== 'SALAO' || !temSalaoDividido) return sectorId.get(p.sheet.sector!)!;
      const cargo = normName(p.sheet.role);
      if (/\bBAR/.test(cargo)) return salao('BAR');
      if (cargo.includes('GERENTE')) return salao('GERENTE');
      return salao('ATENDIMENTO');
    };
    const setoresDoGestor = (g: PlannedEvaluator) => [...new Set([...g.sectors].flatMap((t) =>
      t === 'SALAO' && temSalaoDividido ? [salao('ATENDIMENTO'), salao('BAR')] : [sectorId.get(t)!]))];
    const nomeSetor = (id: string) => sectors.find((x) => x.id === id)?.name ?? id;
    const nomeUnidade = (id: string) => units.find((x) => x.id === id)?.name ?? id;
    console.log('\nUnidades no sistema:', units.map((u) => u.name).join(', '));
    console.log('Setores no sistema:', sectors.map((s) => s.name).join(', '));

    const DIA = 24 * 60 * 60 * 1000;
    const existente = (p: PlannedEmployee) => existentes.find((e) =>
      normName(e.fullName) === normName(p.sheet.name)
      && Math.abs(new Date(e.admissionDate).getTime() - p.sheet.admission.getTime()) <= 1.5 * DIA);
    const jaImportadas = new Set(existentes.flatMap((e) => e.evaluations.map((ev) => ev.externalId)).filter(Boolean));
    const alvoDe = (p: PlannedEmployee) => ({
      roleDescription: p.sheet.role || 'Não informado',
      sectorId: setorDoFuncionario(p),
      unitId: unitId.get(p.sheet.unit!)!,
      shift: p.shift,
    });

    // Plano de gravação por funcionário.
    type Gravacao =
      | { tipo: 'novo'; p: PlannedEmployee; evaluations: PlannedEmployee['evaluations'] }
      | { tipo: 'existente'; p: PlannedEmployee; id: string; merge: MergeResult };
    const gravacoes: Gravacao[] = planos.map((p) => {
      if (!p.sheet.unit || !p.sheet.sector) throw new Error(`L${p.sheet.row} ${p.sheet.name}: sem loja ou setor.`);
      const ja = existente(p);
      if (!ja) return { tipo: 'novo', p, evaluations: p.evaluations.filter((e) => !jaImportadas.has(e.response.externalId)) };
      return { tipo: 'existente', p, id: ja.id, merge: mergeWithExisting(p, ja, alvoDe(p), { sector: nomeSetor, unit: nomeUnidade }) };
    });
    const novos = gravacoes.filter((g) => g.tipo === 'novo');
    const atualizados = gravacoes.filter((g): g is Extract<Gravacao, { tipo: 'existente' }> => g.tipo === 'existente');
    const totalAvaliacoes = gravacoes.reduce((n, g) => n + (g.tipo === 'novo' ? g.evaluations.length : g.merge.evaluations.length), 0);

    // Contas: e-mail igual ou nome igual a uma conta existente = mesma pessoa.
    const adminPorEmail = new Map(admins.map((a) => [a.email.toLowerCase(), a]));
    for (const g of gestores) {
      if (adminPorEmail.has(g.email)) continue;
      const conta = admins.find((x) => normName(x.name) === normName(g.name));
      if (conta) {
        console.log(`AVISO: ${g.email} tem o mesmo nome da conta existente ${conta.email} (${conta.role}); não será criada conta nova.`);
        adminPorEmail.set(g.email, conta);
      }
    }
    const gestoresNovos = gestores.filter((g) => !adminPorEmail.has(g.email));
    // Conta que já existe não tem a senha trocada, mas ganha o escopo que
    // falta para enxergar quem ela mesma avaliou pelo Forms.
    const escopoQueFalta = gestores.flatMap((g) => {
      const conta = adminPorEmail.get(g.email);
      if (!conta || !['GESTOR', 'GESTOR_LIDER'].includes(conta.role)) return [];
      const unidades = [...g.units].map((u) => unitId.get(u)!).filter((id) => !conta.scopedUnits.some((x) => x.unitId === id));
      const setores = setoresDoGestor(g).filter((id) => !conta.scopedSectors.some((x) => x.sectorId === id));
      const turnos = [...g.shifts].filter((s) => !conta.scopedShifts.some((x) => x.shift === s));
      return unidades.length || setores.length || turnos.length ? [{ conta, unidades, setores, turnos }] : [];
    });

    const porSetor = new Map<string, number>();
    for (const p of planos) porSetor.set(nomeSetor(setorDoFuncionario(p)), (porSetor.get(nomeSetor(setorDoFuncionario(p))) ?? 0) + 1);
    console.log('Funcionários por setor do sistema:', [...porSetor].map(([k, v]) => `${k}: ${v}`).join(' · '));
    console.log('Setores de cada gestor no sistema:');
    for (const g of gestores) console.log(`  ${g.email.padEnd(30)} ${setoresDoGestor(g).map(nomeSetor).join(' + ')}`);

    console.log(`\nNo banco hoje: ${existentes.length} funcionários, ${admins.length} usuários.`);
    console.log(`Vai criar ${novos.length} funcionários e conferir ${atualizados.length} que já existem.`);
    for (const a of atualizados) {
      console.log(`  ${a.p.sheet.name}:`);
      for (const c of a.merge.changes) console.log(`      muda ${c.campo}: ${c.antes} → ${c.depois}`);
      for (const d of a.merge.divergencias) console.log(`      mantém ${d.campo} do cadastro: ${d.cadastro} (planilha: ${d.planilha})`);
      if (!a.merge.changes.length && !a.merge.divergencias.length) console.log('      nada muda');
      if (a.merge.evaluations.length) console.log(`      + ${a.merge.evaluations.length} avaliação(ões) do Forms`);
    }
    console.log(`Vai gravar ${totalAvaliacoes} avaliações (${planos.reduce((n, p) => n + p.evaluations.length, 0) - totalAvaliacoes} já estavam no banco).`);
    console.log(`Vai criar ${gestoresNovos.length} gestores; ${gestores.length - gestoresNovos.length} já têm conta e não têm a senha trocada.`);
    for (const e of escopoQueFalta) {
      console.log(`  escopo a acrescentar em ${e.conta.email}: ${[...e.unidades.map(nomeUnidade), ...e.setores.map(nomeSetor), ...e.turnos].join(', ')}`);
    }

    if (!gravar) {
      console.log('\nPRÉVIA — nada foi gravado. Rode de novo com --gravar --senhas <arquivo.xlsx> para importar.');
      return;
    }

    // O arquivo de senhas precisa poder ser escrito ANTES de criar as contas:
    // senha que só existiu em memória não se recupera (conta existente não
    // tem a senha trocada numa nova rodada).
    let reservou = false;
    if (gestoresNovos.length) {
      if (fs.existsSync(senhasPath!)) throw new Error(`${senhasPath} já existe; use outro nome para não sobrescrever senhas anteriores.`);
      const teste = new ExcelJS.Workbook();
      teste.addWorksheet('Acessos');
      await teste.xlsx.writeFile(senhasPath!);
      reservou = true;
    }

    const senhas: { g: PlannedEvaluator; senha: string }[] = [];
    try {
      await db.transaction(async (tx) => {
        // 1. gestores
        const idDoGestor = new Map<string, string>();
        for (const g of gestores) {
          const ja = adminPorEmail.get(g.email);
          if (ja) { idDoGestor.set(g.email, ja.id); continue; }
          const senha = senhaAleatoria();
          const [row] = await tx.insert(schema.admins).values({
            email: g.email, name: g.name, role: 'GESTOR', passwordHash: await hashPassword(senha),
          }).returning({ id: schema.admins.id });
          idDoGestor.set(g.email, row.id);
          senhas.push({ g, senha });
          await tx.insert(schema.adminUnits).values([...g.units].map((u) => ({ adminId: row.id, unitId: unitId.get(u)! })));
          await tx.insert(schema.adminSectors).values(setoresDoGestor(g).map((sid) => ({ adminId: row.id, sectorId: sid })));
          await tx.insert(schema.adminShifts).values([...g.shifts].map((shift) => ({ adminId: row.id, shift })));
        }
        for (const e of escopoQueFalta) {
          if (e.unidades.length) await tx.insert(schema.adminUnits).values(e.unidades.map((uid) => ({ adminId: e.conta.id, unitId: uid }))).onConflictDoNothing();
          if (e.setores.length) await tx.insert(schema.adminSectors).values(e.setores.map((sid) => ({ adminId: e.conta.id, sectorId: sid }))).onConflictDoNothing();
          if (e.turnos.length) await tx.insert(schema.adminShifts).values(e.turnos.map((shift) => ({ adminId: e.conta.id, shift }))).onConflictDoNothing();
        }

        // 2. funcionários + avaliações
        const inserirAvaliacoes = async (employeeId: string, lista: PlannedEmployee['evaluations']) => {
          for (const e of lista) {
            const g = gestorDoRotulo(e.response.evaluatorLabel);
            const r = e.response;
            await tx.insert(schema.performanceEvaluations).values({
              employeeId,
              period: e.period,
              cycleNumber: e.cycleNumber,
              evaluationDate: e.evaluationDate,
              dueDateAtEvaluation: e.dueDateAtEvaluation,
              // Gestor desligado não tem conta: fica só o nome.
              evaluatorAdminId: g ? idDoGestor.get(g.email) ?? null : null,
              evaluatorName: g?.name ?? evaluatorDisplayName(r.evaluatorLabel),
              source: 'FORMS',
              externalId: r.externalId,
              flexibilityRating: r.flexibilityRating, flexibilitySubAnswers: r.flexibilitySubAnswers,
              interestRating: r.interestRating, interestSubAnswers: r.interestSubAnswers,
              relationshipRating: r.relationshipRating, relationshipSubAnswers: r.relationshipSubAnswers,
              learningRating: r.learningRating, learningSubAnswers: r.learningSubAnswers,
              favorableAspects: r.favorableAspects,
              unfavorableAspects: r.unfavorableAspects,
              classification: r.classification,
              conclusion: r.conclusion,
              createdAt: r.submittedAt,
            });
          }
        };
        for (const gv of gravacoes) {
          const p = gv.p;
          if (gv.tipo === 'novo') {
            const [row] = await tx.insert(schema.probationaryEmployees).values({
              fullName: p.sheet.name,
              admissionDate: p.sheet.admission,
              ...alvoDe(p),
              period1DueDate: p.period1DueDate,
              period2DueDate: p.period2DueDate,
              status: p.status,
              isApprentice: p.isApprentice,
              terminationReason: p.termination?.reason ?? null,
              terminationDate: p.termination?.date ?? null,
              terminationNotes: p.termination?.notes ?? null,
            }).returning({ id: schema.probationaryEmployees.id });
            await inserirAvaliacoes(row.id, gv.evaluations);
          } else {
            if (Object.keys(gv.merge.set).length) {
              await tx.update(schema.probationaryEmployees)
                .set({ ...gv.merge.set, updatedAt: new Date() })
                .where(eqId(gv.id));
            }
            await inserirAvaliacoes(gv.id, gv.merge.evaluations);
          }
        }

        await tx.insert(schema.auditLogs).values({
          adminId: null,
          action: 'employee.import',
          entityType: 'ProbationaryEmployee',
          metadata: {
            origem: 'scripts/import-experiencia.ts', ano,
            funcionariosCriados: novos.length, funcionariosConferidos: atualizados.length,
            avaliacoes: totalAvaliacoes, gestoresCriados: senhas.length,
            gestoresDesligadosSemConta: [...gestoresDesligados.keys()],
            escopoAcrescentado: escopoQueFalta.map((e) => e.conta.email),
          },
        });
      });
    } catch (err) {
      // Nada foi gravado: o arquivo reservado (vazio) sai, para a próxima
      // tentativa poder usar o mesmo nome.
      if (reservou) fs.rmSync(senhasPath!, { force: true });
      throw err;
    }

    // Senhas só depois do commit: se a transação cair, nenhuma planilha com
    // senha de conta inexistente fica circulando.
    if (senhas.length) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Acessos');
      ws.columns = [
        { header: 'Nome', key: 'nome', width: 42 },
        { header: 'E-mail (login)', key: 'email', width: 32 },
        { header: 'Senha inicial', key: 'senha', width: 16 },
        { header: 'Perfil', key: 'perfil', width: 10 },
        { header: 'Loja', key: 'loja', width: 18 },
        { header: 'Setor', key: 'setor', width: 40 },
        { header: 'Turno', key: 'turno', width: 14 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const { g, senha } of senhas) {
        ws.addRow({
          nome: g.name, email: g.email, senha, perfil: 'Gestor',
          loja: [...g.units].map((u) => nomeUnidade(unitId.get(u)!)).join(' + '),
          setor: setoresDoGestor(g).map(nomeSetor).join(' + '),
          turno: [...g.shifts].map((s) => (s === 'DIA' ? 'Diurno' : 'Noturno')).join(' + '),
        });
      }
      try {
        await wb.xlsx.writeFile(senhasPath!);
        console.log(`Senhas dos gestores novos em: ${senhasPath}`);
      } catch (err) {
        const reserva = path.join(os.tmpdir(), `spot-clima-acessos-${crypto.randomBytes(4).toString('hex')}.xlsx`);
        try {
          await wb.xlsx.writeFile(reserva);
          console.error(`Não consegui gravar ${senhasPath} (${(err as Error).message}). Senhas salvas em: ${reserva}`);
        } catch {
          console.error('Não consegui gravar a planilha de senhas. Anote agora — elas não aparecem de novo:');
          for (const { g, senha } of senhas) console.error(`  ${g.email}  ${senha}`);
        }
      }
    }

    console.log(`\nGRAVADO: ${novos.length} funcionários criados, ${atualizados.length} conferidos, ${totalAvaliacoes} avaliações, ${senhas.length} gestores, escopo ampliado em ${escopoQueFalta.length} conta(s).`);
  } finally {
    await pool.end();
  }
}

const eqId = (id: string) => eq(schema.probationaryEmployees.id, id);

main().catch((err) => {
  console.error('\nFALHOU:', err instanceof Error ? err.message : err);
  process.exit(1);
});
