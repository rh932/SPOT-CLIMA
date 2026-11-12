/**
 * Regras da importação do histórico de experiência — lógica pura, sem I/O.
 *
 * Fontes (ver scripts/import-experiencia.ts):
 * - "Quadro de Admissões e Demissões" do DP (xlsx): quem entrou, loja, setor,
 *   cargo, admissão e o que o DP anotou de cada período;
 * - respostas do Google Forms "AVALIAÇÃO DE DESEMPENHO - RH SPOT" (csv), que
 *   é o mesmo formulário que o portal do gestor reproduz (src/data/evaluationBank).
 *
 * A planilha é a fonte do cadastro e da data de admissão (o Forms é digitado
 * pelo gestor e tem erros como admissão em 2026-12-09 para quem entrou em
 * 2025-12-09); o Forms é a fonte do conteúdo das avaliações.
 */

import { computeDueDates } from './probation';
import { classifyTerminationText, statusFromEvaluations, type ProbationStatus, type TerminationReason } from './termination';

// ------------------------------------------------------------------
// Texto
// ------------------------------------------------------------------

/** Nome para comparar: sem acento, maiúsculo, só letras e um espaço entre palavras. */
export function normName(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** CSV do Google (RFC 4180): aspas duplas, vírgula, quebra de linha dentro de campo. */
export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim() !== ''));
}

// "EL" entra junto: HAMZA EL HENNAWI vira hamza.hennawi, não hamza.el.
const PARTICULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EL']);

/** "JOÃO GUILHERME FERNANDES (SALÃO JK)" -> "joao.guilherme@spot.com" (1º e 2º nome, sem "de/da/dos"). */
export function emailFromName(nome: string): string {
  const partes = normName(nome.replace(/\(.*?\)/g, '')).split(' ').filter((p) => p && !PARTICULAS.has(p));
  return `${partes.slice(0, 2).join('.').toLowerCase()}@spot.com`;
}

/** Nome do avaliador sem o "(SALÃO JK)" que o Forms põe para identificar o setor. */
export function evaluatorDisplayName(rotulo: string): string {
  return rotulo.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
}

export type UnitTag = 'JK' | 'PP';
export type SectorTag = 'COZINHA' | 'SALAO' | 'ADM' | 'DELIVERY';

export function unitTagFrom(texto: string): UnitTag | null {
  const t = normName(texto);
  if (/\bJK\b/.test(t)) return 'JK';
  if (/\bPP\b/.test(t) || t.includes('PAULISTA')) return 'PP';
  return null;
}

export function sectorTagFrom(texto: string): SectorTag | null {
  const t = normName(texto);
  if (t.includes('COZ')) return 'COZINHA';
  if (t.includes('SAL')) return 'SALAO';
  if (t.includes('DEL')) return 'DELIVERY';
  if (/\bADM\b/.test(t) || t.includes('ADMIN')) return 'ADM';
  return null;
}

// ------------------------------------------------------------------
// Forms
// ------------------------------------------------------------------

type Rating = 'OTIMO' | 'BOM' | 'REGULAR' | 'RUIM';
type Sub = 'SIM' | 'NAO' | 'TALVEZ' | 'REGULAR';
export type Classification = 'FRACO' | 'ALGUMAS_POSSIBILIDADES' | 'OTIMAS_PERSPECTIVAS' | 'EXCELENTE_AQUISICAO';
export type Conclusion = 'DEMITIR' | 'EFETIVAR' | 'EXTENDER';

function rating(v: string): Rating {
  const t = normName(v);
  if (t === 'OTIMO') return 'OTIMO';
  if (t === 'BOM') return 'BOM';
  if (t === 'REGULAR') return 'REGULAR';
  if (t === 'RUIM') return 'RUIM';
  throw new Error(`Nota desconhecida: "${v}"`);
}

function sub(v: string): Sub {
  const t = normName(v);
  if (t === 'SIM') return 'SIM';
  if (t === 'NAO') return 'NAO';
  if (t === 'TALVEZ') return 'TALVEZ';
  if (t === 'REGULAR') return 'REGULAR';
  throw new Error(`Resposta desconhecida: "${v}"`);
}

function classification(v: string): Classification {
  const t = normName(v);
  if (t.startsWith('FRACO')) return 'FRACO';
  if (t.startsWith('TEM ALGUMAS')) return 'ALGUMAS_POSSIBILIDADES';
  if (t.startsWith('POSSUI OTIMAS')) return 'OTIMAS_PERSPECTIVAS';
  if (t.includes('EXCELENTE')) return 'EXCELENTE_AQUISICAO';
  throw new Error(`Classificação desconhecida: "${v}"`);
}

function conclusion(v: string): Conclusion {
  const t = normName(v);
  if (t.startsWith('DEMITIR')) return 'DEMITIR';
  if (t.startsWith('EFETIVAR')) return 'EFETIVAR';
  if (t.includes('DIAS')) return 'EXTENDER';
  throw new Error(`Conclusão desconhecida: "${v}"`);
}

/** "2026/02/04 3:04:53 PM GMT-3" -> Date em UTC. */
export function parseFormsTimestamp(v: string): Date {
  const m = v.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM) GMT([+-]\d+)/);
  if (!m) throw new Error(`Carimbo de data/hora desconhecido: "${v}"`);
  let h = Number(m[4]) % 12;
  if (m[7] === 'PM') h += 12;
  const offset = Number(m[8]);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h - offset, Number(m[5]), Number(m[6])));
}

/** Data sem hora ("2026-02-04") gravada ao meio-dia UTC, o mesmo que o painel faz. */
export function isoDateAtNoon(v: string): Date | null {
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

export interface FormsResponse {
  externalId: string;
  submittedAt: Date;
  /** Data que o gestor informou como preenchimento (pode vir errada — ver resolveEvaluationDate). */
  filledDate: Date | null;
  evaluatorLabel: string;
  evaluatorUnit: UnitTag | null;
  employeeName: string;
  admissionInForms: string;
  period: 'FIRST' | 'SECOND';
  shiftHint: 'DIA' | 'NOITE' | null;
  flexibilityRating: Rating;
  flexibilitySubAnswers: Record<string, Sub>;
  interestRating: Rating;
  interestSubAnswers: Record<string, Sub>;
  relationshipRating: Rating;
  relationshipSubAnswers: Record<string, Sub>;
  learningRating: Rating;
  learningSubAnswers: Record<string, Sub>;
  favorableAspects: string;
  unfavorableAspects: string;
  classification: Classification;
  conclusion: Conclusion;
}

/**
 * Uma linha do CSV. As colunas seguem a ordem do formulário; o cabeçalho é
 * conferido em `assertFormsHeader` para que uma pergunta nova no Forms não
 * desloque tudo em silêncio.
 */
export function parseFormsRow(r: string[]): FormsResponse {
  const avaliador = (r[3] || r[4] || '').trim();
  const depto = normName(r[7]);
  const turno = /\bNOITE\b/.test(depto) ? 'NOITE' : /\bDIA\b/.test(depto) ? 'DIA' : null;
  const submittedAt = parseFormsTimestamp(r[0]);
  return {
    externalId: `forms:${submittedAt.toISOString()}|${normName(r[5])}`,
    submittedAt,
    filledDate: isoDateAtNoon(r[1]),
    evaluatorLabel: avaliador,
    evaluatorUnit: r[2]?.toUpperCase().includes('PAULISTA') ? 'PP' : r[2]?.toUpperCase().includes('JK') ? 'JK' : null,
    employeeName: r[5].replace(/\s+/g, ' ').trim(),
    admissionInForms: r[6].trim(),
    period: r[9].startsWith('2') ? 'SECOND' : 'FIRST',
    shiftHint: turno,
    flexibilityRating: rating(r[11]),
    flexibilitySubAnswers: { q1: sub(r[12]), q2: sub(r[13]), q3: sub(r[14]), q4: sub(r[15]) },
    interestRating: rating(r[16]),
    interestSubAnswers: { q1: sub(r[17]), q2: sub(r[18]), q3: sub(r[19]) },
    relationshipRating: rating(r[20]),
    relationshipSubAnswers: { q1: sub(r[21]), q2: sub(r[22]) },
    learningRating: rating(r[23]),
    learningSubAnswers: { q1: sub(r[24]), q2: sub(r[25]) },
    favorableAspects: r[26].trim(),
    unfavorableAspects: r[27].trim(),
    classification: classification(r[28]),
    conclusion: conclusion(r[29]),
  };
}

export function assertFormsHeader(h: string[]): void {
  const esperado: [number, string][] = [
    [0, 'CARIMBO'], [5, 'NOME COMPLETO DO COLABORADOR'], [9, 'QUAL DOS PERIODOS'],
    [11, 'ADAPTACAO DO FUNCIONARIO'], [16, 'NIVEL DE ENTUSIASMO'], [20, 'CAPACIDADE DE INTEGRAR'],
    [23, 'FACILIDADE DE ABSORVER'], [26, 'MAIS FAVORAVEIS'], [27, 'MENOS FAVORAVEIS'],
    [28, 'COMO O FUNCIONARIO PODE SER CLASSIFICADO'], [29, 'CONCLUSAO'],
  ];
  for (const [i, trecho] of esperado) {
    if (!normName(h[i]).includes(trecho)) {
      throw new Error(`Coluna ${i + 1} do CSV não é "${trecho}" (veio "${h[i]}"). O formulário mudou?`);
    }
  }
}

/**
 * Data da avaliação: a que o gestor informou, a não ser que seja impossível
 * (antes da admissão ou depois do envio — há "maio de 2016" no Forms). Aí
 * vale o dia em que a resposta foi enviada.
 */
export function resolveEvaluationDate(resp: FormsResponse, admission: Date): { date: Date; corrigida: boolean } {
  const envio = new Date(Date.UTC(
    resp.submittedAt.getUTCFullYear(), resp.submittedAt.getUTCMonth(), resp.submittedAt.getUTCDate(), 12,
  ));
  // O carimbo está em UTC; às 22h de Brasília já é o dia seguinte em UTC.
  const envioBrasil = new Date(resp.submittedAt.getTime() - 3 * 60 * 60 * 1000);
  const diaEnvio = new Date(Date.UTC(envioBrasil.getUTCFullYear(), envioBrasil.getUTCMonth(), envioBrasil.getUTCDate(), 12));
  const d = resp.filledDate;
  const DIA = 24 * 60 * 60 * 1000;
  if (d && d.getTime() >= admission.getTime() - DIA && d.getTime() <= envio.getTime() + DIA) {
    return { date: d, corrigida: false };
  }
  return { date: diaEnvio, corrigida: true };
}

// ------------------------------------------------------------------
// Planilha
// ------------------------------------------------------------------

export interface SheetAdmission {
  row: number;
  name: string;
  unit: UnitTag | null;
  sector: SectorTag | null;
  role: string;
  hours: string | null;
  shift: 'DIA' | 'NOITE' | null;
  admission: Date;
  eval1: string | null;
  eval2: string | null;
  conclusion: string | null;
}

export interface SheetTermination {
  row: number;
  name: string;
  unit: UnitTag | null;
  reasonText: string;
  date: Date | null;
}

/** "17h30 às 00h30" -> NOITE; "08h10 às 16h30" -> DIA. */
export function shiftFromHours(h: string | null): 'DIA' | 'NOITE' | null {
  const m = String(h ?? '').match(/(\d{1,2})\s*[hH:]/);
  if (!m) return null;
  return Number(m[1]) >= 15 ? 'NOITE' : 'DIA';
}

export const isApprenticeRole = (cargo: string) => normName(cargo).startsWith('APRENDIZ');

// ------------------------------------------------------------------
// Plano por funcionário
// ------------------------------------------------------------------

export interface PlannedEvaluation {
  response: FormsResponse;
  period: 'FIRST' | 'SECOND';
  cycleNumber: number;
  evaluationDate: Date;
  dueDateAtEvaluation: Date;
  evaluationDateCorrected: boolean;
}

export interface PlannedEmployee {
  sheet: SheetAdmission;
  shift: 'DIA' | 'NOITE';
  shiftSource: 'forms' | 'planilha' | 'horário' | 'padrão';
  isApprentice: boolean;
  status: ProbationStatus;
  period1DueDate: Date;
  period2DueDate: Date;
  termination: { reason: TerminationReason; date: Date | null; notes: string } | null;
  evaluations: PlannedEvaluation[];
  avisos: string[];
}

const TERMINOU_NA_PLANILHA = /RESCIS|ABANDONO|DEMIT/;

/** A aba de demissões também registra transferência entre lojas — quem é transferido continua trabalhando. */
export const isTransfer = (t: Pick<SheetTermination, 'reasonText'>) => normName(t.reasonText).includes('TRANSFER');

const diaUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * A saída que encerra ESTA admissão: no próprio dia dela ou depois, e antes
 * da próxima admissão da mesma pessoa (quem sai e volta tem dois vínculos;
 * o aprendiz que termina num dia e é contratado no seguinte, também).
 */
export function exitForAdmission(
  name: string, admission: Date, nextAdmission: Date | null, terminations: SheetTermination[],
): SheetTermination | undefined {
  return terminations
    .filter((t) => normName(t.name) === normName(name) && t.date && !isTransfer(t)
      && diaUtc(t.date) >= diaUtc(admission)
      && (!nextAdmission || diaUtc(t.date) < diaUtc(nextAdmission)))
    .sort((a, b) => a.date!.getTime() - b.date!.getTime())[0];
}

export function planEmployee(
  sheet: SheetAdmission,
  responses: FormsResponse[],
  terminations: SheetTermination[],
  /** Próxima admissão da mesma pessoa na planilha, se ela saiu e voltou. */
  nextAdmission: Date | null = null,
): PlannedEmployee {
  const avisos: string[] = [];
  const { period1DueDate, period2DueDate } = computeDueDates(sheet.admission);
  const isApprentice = isApprenticeRole(sheet.role);

  // Avaliações, na ordem em que foram feitas. Dois gestores no mesmo setor
  // às vezes avaliam o mesmo período: a 2ª resposta vira cycleNumber 2.
  const ordenadas = [...responses].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const contagem = { FIRST: 0, SECOND: 0 };
  const evaluations: PlannedEvaluation[] = ordenadas.map((response) => {
    const { date, corrigida } = resolveEvaluationDate(response, sheet.admission);
    if (corrigida) {
      avisos.push(`Data de preenchimento impossível no Forms (${response.filledDate?.toISOString().slice(0, 10) ?? 'vazia'}); usada a data do envio.`);
    }
    if (response.admissionInForms && response.admissionInForms !== sheet.admission.toISOString().slice(0, 10)) {
      avisos.push(`Admissão no Forms (${response.admissionInForms}) diferente da planilha (${sheet.admission.toISOString().slice(0, 10)}); vale a planilha.`);
    }
    contagem[response.period] += 1;
    return {
      response,
      period: response.period,
      cycleNumber: contagem[response.period],
      evaluationDate: date,
      dueDateAtEvaluation: response.period === 'FIRST' ? period1DueDate : period2DueDate,
      evaluationDateCorrected: corrigida,
    };
  });
  if (contagem.FIRST > 1) avisos.push(`${contagem.FIRST} respostas do 1º período (mais de um gestor avaliou).`);
  if (contagem.SECOND > 1) avisos.push(`${contagem.SECOND} respostas do 2º período (mais de um gestor avaliou).`);
  const extendeuNo2 = evaluations.find((e) => e.period === 'SECOND' && e.response.conclusion === 'EXTENDER');
  if (extendeuNo2) avisos.push('Uma resposta do 2º período concluiu "+45 dias", que não existe depois dos 90 dias: tratado como efetivado (o contrato já virou indeterminado).');

  // Turno: o Forms diz ("SALÃO GARÇOM NOITE"), senão a coluna da planilha,
  // senão o horário.
  const ultimaComTurno = [...ordenadas].reverse().find((r) => r.shiftHint);
  let shift: 'DIA' | 'NOITE' = 'DIA';
  let shiftSource: PlannedEmployee['shiftSource'] = 'padrão';
  if (ultimaComTurno?.shiftHint) { shift = ultimaComTurno.shiftHint; shiftSource = 'forms'; }
  else if (sheet.shift) { shift = sheet.shift; shiftSource = 'planilha'; }
  else {
    const h = shiftFromHours(sheet.hours);
    if (h) { shift = h; shiftSource = 'horário'; } else avisos.push('Sem turno nem horário: cadastrado como diurno.');
  }

  // Desligamento: a aba de demissões manda (tem motivo e data).
  const saida = exitForAdmission(sheet.name, sheet.admission, nextAdmission, terminations);
  const transferencia = terminations.find((t) => normName(t.name) === normName(sheet.name) && t.date && isTransfer(t)
    && diaUtc(t.date) >= diaUtc(sheet.admission) && (!nextAdmission || diaUtc(t.date) < diaUtc(nextAdmission)));
  if (transferencia) {
    avisos.push(`Aba de demissões registra "${transferencia.reasonText.trim()}" em ${transferencia.date!.toISOString().slice(0, 10)}: transferência não é desligamento, ignorada (confira a loja).`);
  }

  const anotacao = normName([sheet.eval1, sheet.eval2, sheet.conclusion].filter(Boolean).join(' '));
  let termination: PlannedEmployee['termination'] = null;
  if (saida) {
    termination = { reason: classifyTerminationText(saida.reasonText), date: saida.date, notes: saida.reasonText.trim() };
  } else if (TERMINOU_NA_PLANILHA.test(anotacao)) {
    const texto = /ABANDONO/.test(anotacao) ? 'Abandono de emprego' : /RESCIS/.test(anotacao) ? 'Rescisão' : 'Demitido na avaliação';
    termination = { reason: classifyTerminationText(texto), date: null, notes: `${texto} (anotado no quadro de admissões, sem data de saída)` };
    avisos.push(`Desligado pela anotação da planilha ("${texto}"), sem linha na aba de demissões: data de saída em branco.`);
  }

  let status: ProbationStatus;
  if (termination) status = 'TERMINATED';
  else if (isApprentice) status = 'HIRED';
  else {
    status = statusFromEvaluations(evaluations.map((e) => ({
      period: e.period, conclusion: e.response.conclusion, evaluationDate: e.evaluationDate,
    })));
    const conclusaoPlanilha = normName(sheet.conclusion);
    if (/EFETIVAD/.test(anotacao) && status !== 'HIRED') {
      // "APRENDIZ EFETIVADO": ex-aprendiz contratado, sem nova experiência.
      status = 'HIRED';
      avisos.push('Anotado como efetivado na planilha, sem resposta no Forms.');
    } else if (evaluations.length === 0 && conclusaoPlanilha.startsWith('EFETIVAR')) {
      status = 'HIRED';
      avisos.push('Efetivado na planilha, sem resposta no Forms.');
    } else if (evaluations.length === 0 && conclusaoPlanilha.includes('DIAS')) {
      status = 'AWAITING_PERIOD_2';
      avisos.push('Prorrogado (+45) na planilha, sem resposta no Forms.');
    }
    if (status === 'TERMINATED') {
      // Avaliação concluiu "Demitir" e a aba de demissões não tem a saída.
      termination = { reason: 'DISPENSA_EXPERIENCIA', date: null, notes: 'Demitido na avaliação de experiência (sem linha na aba de demissões)' };
    }
    // "ENVIADO NO PRAZO" é o DP dizendo que mandou o formulário ao gestor, não
    // que ele respondeu (a legenda da planilha põe ao lado de "PENDENTE").
    const falta1 = /ENVIADO/.test(normName(sheet.eval1)) && !evaluations.some((e) => e.period === 'FIRST');
    const falta2 = /ENVIADO/.test(normName(sheet.eval2)) && !evaluations.some((e) => e.period === 'SECOND');
    if ((falta1 && status === 'AWAITING_PERIOD_1') || (falta2 && status === 'AWAITING_PERIOD_2')) {
      avisos.push(`Formulário do ${falta1 ? '1º' : '2º'} período enviado ao gestor ("${falta1 ? sheet.eval1 : sheet.eval2}") e ainda sem resposta: fica pendente.`);
    }
    if (conclusaoPlanilha.startsWith('EFETIVAR') && status !== 'HIRED') {
      avisos.push(`Planilha diz EFETIVAR, mas as respostas do Forms dão "${status}".`);
    }
  }

  return { sheet, shift, shiftSource, isApprentice, status, period1DueDate, period2DueDate, termination, evaluations, avisos };
}

// ------------------------------------------------------------------
// Gestores do Forms
// ------------------------------------------------------------------

export interface PlannedEvaluator {
  name: string;
  email: string;
  units: Set<UnitTag>;
  sectors: Set<SectorTag>;
  shifts: Set<'DIA' | 'NOITE'>;
  labels: Set<string>;
}

/**
 * Um gestor por pessoa (o Forms lista "MARCIO NUNES (ADM - JK)" e
 * "MARCIO NUNES (ADM - PP)" como opções diferentes). O escopo junta o que o
 * rótulo diz com o que ele de fato avaliou: quem é "(ADM)" avaliou o
 * Delivery, e sem isso não enxergaria no portal quem ele mesmo avaliou.
 */
export function planEvaluators(
  /** Opções do Forms, com a loja da seção onde aparecem ("IDENTIFICAÇÃO DO AVALIADOR - JK"). */
  labels: { label: string; unit: UnitTag | null }[],
  evaluated: { label: string; unit: UnitTag | null; sector: SectorTag | null; shift: 'DIA' | 'NOITE' }[],
): PlannedEvaluator[] {
  const porNome = new Map<string, PlannedEvaluator>();
  const pegar = (label: string, unidadeDaSecao: UnitTag | null = null) => {
    const name = evaluatorDisplayName(label);
    const chave = normName(name);
    let g = porNome.get(chave);
    if (!g) {
      g = { name, email: emailFromName(name), units: new Set(), sectors: new Set(), shifts: new Set(), labels: new Set() };
      porNome.set(chave, g);
    }
    if (!g.labels.has(label)) {
      g.labels.add(label);
      const dentro = label.match(/\((.*?)\)/)?.[1] ?? '';
      const u = unitTagFrom(dentro);
      const s = sectorTagFrom(dentro);
      if (u) g.units.add(u);
      if (s) g.sectors.add(s);
    }
    if (unidadeDaSecao) g.units.add(unidadeDaSecao);
    return g;
  };
  for (const l of labels) if (l.label.trim()) pegar(l.label.trim(), l.unit);
  for (const e of evaluated) {
    const g = pegar(e.label);
    if (e.unit) g.units.add(e.unit);
    if (e.sector) g.sectors.add(e.sector);
    g.shifts.add(e.shift);
  }
  for (const g of porNome.values()) {
    // Sem loja no rótulo nem avaliação feita: cobre as duas.
    if (g.units.size === 0) { g.units.add('JK'); g.units.add('PP'); }
    // Sem avaliação que diga o turno: os dois (há dois gestores por setor e
    // o turno de cada um o RH ajusta no cadastro).
    if (g.shifts.size === 0) { g.shifts.add('DIA'); g.shifts.add('NOITE'); }
  }
  // E-mails iguais para pessoas diferentes ganham o 3º nome.
  const usados = new Map<string, number>();
  for (const g of porNome.values()) usados.set(g.email, (usados.get(g.email) ?? 0) + 1);
  for (const g of porNome.values()) {
    if ((usados.get(g.email) ?? 0) > 1) {
      const partes = normName(g.name).split(' ').filter((p) => !PARTICULAS.has(p));
      g.email = `${partes.slice(0, 3).join('.').toLowerCase()}@spot.com`;
    }
  }
  return [...porNome.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * O gestor listado no Forms ainda trabalha na empresa? O Forms guarda nomes
 * de quem já saiu (HAMZA EL HENNAWI, desligado em 13/08/2026, continuava na
 * lista). Desligado = tem saída (não transferência) no mesmo dia da última
 * admissão dele ou depois, e não avaliou ninguém depois dessa saída.
 * Compara o nome exato: "HAMILTON OLIVEIRA" não é "HAMILTON CHAVES OLIVEIRA".
 */
export function evaluatorExit(
  name: string,
  admissions: Pick<SheetAdmission, 'name' | 'admission'>[],
  terminations: SheetTermination[],
  lastEvaluationAt: Date | null,
): SheetTermination | null {
  const n = normName(name);
  const ultimaAdmissao = admissions
    .filter((a) => normName(a.name) === n)
    .reduce<Date | null>((max, a) => (!max || a.admission > max ? a.admission : max), null);
  const saida = terminations
    .filter((t) => normName(t.name) === n && t.date && !isTransfer(t)
      && (!ultimaAdmissao || diaUtc(t.date) >= diaUtc(ultimaAdmissao)))
    .sort((a, b) => b.date!.getTime() - a.date!.getTime())[0];
  if (!saida) return null;
  if (lastEvaluationAt && lastEvaluationAt.getTime() > saida.date!.getTime()) return null;
  return saida;
}

// ------------------------------------------------------------------
// Funcionário que já existe no sistema
// ------------------------------------------------------------------

type Status = ProbationStatus;
const ORDEM_STATUS: Record<Exclude<Status, 'TERMINATED'>, number> = { AWAITING_PERIOD_1: 0, AWAITING_PERIOD_2: 1, HIRED: 2 };

export interface ExistingEmployee {
  id: string;
  fullName: string;
  admissionDate: Date;
  roleDescription: string;
  sectorId: string;
  unitId: string;
  shift: 'DIA' | 'NOITE';
  status: Status;
  isApprentice: boolean;
  terminationReason: TerminationReason | null;
  terminationDate: Date | null;
  terminationNotes: string | null;
  previousStatus: Status | null;
  period1DueDate: Date;
  period2DueDate: Date;
  evaluations: {
    period: 'FIRST' | 'SECOND' | 'FEEDBACK';
    cycleNumber: number;
    conclusion: 'DEMITIR' | 'EFETIVAR' | 'EXTENDER' | null;
    evaluationDate: Date;
    externalId: string | null;
  }[];
}

export interface MergeResult {
  /** Só os campos que mudam. */
  set: Partial<{
    status: Status;
    isApprentice: boolean;
    previousStatus: Status | null;
    terminationReason: TerminationReason | null;
    terminationDate: Date | null;
    terminationNotes: string | null;
    period1DueDate: Date;
    period2DueDate: Date;
  }>;
  /** Para a prévia: o que muda, campo a campo. */
  changes: { campo: string; antes: string; depois: string }[];
  /** Diferenças entre cadastro e planilha que ficam como estão no cadastro. */
  divergencias: { campo: string; cadastro: string; planilha: string }[];
  /** Avaliações do Forms que ainda não estão no banco, com o ciclo já numerado depois das existentes. */
  evaluations: PlannedEvaluation[];
}

const txt = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '—' : String(v));

/**
 * Junta o plano da importação com um cadastro que já está no banco — sem
 * desfazer o que o RH e os gestores registraram depois (padrão "conferir, não
 * substituir"):
 * - cadastro (cargo, setor, loja, turno) fica como está; diferença vira aviso;
 * - desligamento registrado pelo RH não é tocado;
 * - a situação nunca anda para trás (Aguardando 1º < 2º < Efetivado);
 * - avaliação que já foi importada (external_id) não entra de novo, e as
 *   novas são numeradas depois das que existem no mesmo período;
 * - os prazos só são recalculados enquanto não há avaliação (regra do PATCH).
 */
export function mergeWithExisting(
  plan: PlannedEmployee,
  existing: ExistingEmployee,
  alvo: { roleDescription: string; sectorId: string; unitId: string; shift: 'DIA' | 'NOITE'; sectorName?: string; unitName?: string },
  nomes: { sector: (id: string) => string; unit: (id: string) => string } = { sector: (x) => x, unit: (x) => x },
): MergeResult {
  const set: MergeResult['set'] = {};
  const changes: MergeResult['changes'] = [];
  const divergencias: MergeResult['divergencias'] = [];
  const mudar = <K extends keyof MergeResult['set']>(campo: K, valor: MergeResult['set'][K], rotulo: string) => {
    const antes = (existing as unknown as Record<string, unknown>)[campo];
    const igual = antes instanceof Date && valor instanceof Date ? antes.getTime() === valor.getTime() : antes === valor;
    if (igual) return;
    set[campo] = valor;
    changes.push({ campo: rotulo, antes: txt(antes), depois: txt(valor) });
  };

  // Cadastro: confere, não substitui.
  if (existing.roleDescription.trim().toUpperCase() !== alvo.roleDescription.trim().toUpperCase()) {
    divergencias.push({ campo: 'cargo', cadastro: existing.roleDescription, planilha: alvo.roleDescription });
  }
  if (existing.sectorId !== alvo.sectorId) divergencias.push({ campo: 'setor', cadastro: nomes.sector(existing.sectorId), planilha: nomes.sector(alvo.sectorId) });
  if (existing.unitId !== alvo.unitId) divergencias.push({ campo: 'loja', cadastro: nomes.unit(existing.unitId), planilha: nomes.unit(alvo.unitId) });
  if (existing.shift !== alvo.shift) divergencias.push({ campo: 'turno', cadastro: existing.shift, planilha: `${alvo.shift} (${plan.shiftSource})` });

  // Avaliações novas, numeradas depois das que já existem no período.
  const importadas = new Set(existing.evaluations.map((e) => e.externalId).filter(Boolean));
  const maior = { FIRST: 0, SECOND: 0 };
  for (const e of existing.evaluations) {
    if (e.period === 'FIRST' || e.period === 'SECOND') maior[e.period] = Math.max(maior[e.period], e.cycleNumber);
  }
  const evaluations = plan.evaluations
    .filter((e) => !importadas.has(e.response.externalId))
    .map((e) => ({ ...e, cycleNumber: ++maior[e.period] }));

  // Prazos: só enquanto nenhuma avaliação valeu por eles.
  const semAvaliacao = existing.evaluations.length === 0;
  if (semAvaliacao) {
    const { period1DueDate, period2DueDate } = computeDueDates(existing.admissionDate);
    mudar('period1DueDate', period1DueDate, 'fim do 1º contrato');
    mudar('period2DueDate', period2DueDate, 'fim do 2º contrato');
    mudar('isApprentice', plan.isApprentice, 'aprendiz');
  }
  const isApprentice = semAvaliacao ? plan.isApprentice : existing.isApprentice;

  // Desligamento.
  if (existing.terminationReason) {
    // Registrado pelo RH (ou por uma importação anterior): fica.
    if (plan.termination && plan.termination.reason !== existing.terminationReason) {
      divergencias.push({ campo: 'motivo do desligamento', cadastro: existing.terminationReason, planilha: plan.termination.reason });
    }
    return { set, changes, divergencias, evaluations };
  }
  if (plan.termination) {
    if (existing.status !== 'TERMINATED') {
      mudar('previousStatus', existing.status, 'situação anterior');
      mudar('status', 'TERMINATED', 'situação');
    }
    mudar('terminationReason', plan.termination.reason, 'motivo do desligamento');
    mudar('terminationDate', plan.termination.date, 'data de saída');
    mudar('terminationNotes', plan.termination.notes, 'descrição do desligamento');
    return { set, changes, divergencias, evaluations };
  }
  if (existing.status === 'TERMINATED') {
    // Desligado por "Demitir" no portal: a planilha ainda não tem a saída.
    return { set, changes, divergencias, evaluations };
  }

  // Situação: a mais adiantada entre o cadastro, o plano e as avaliações
  // somadas (banco + Forms). Nunca anda para trás.
  const somadas = [
    ...existing.evaluations.map((e) => ({ period: e.period, conclusion: e.conclusion, evaluationDate: e.evaluationDate })),
    ...evaluations.map((e) => ({ period: e.period, conclusion: e.response.conclusion, evaluationDate: e.evaluationDate })),
  ];
  const pelasAvaliacoes = statusFromEvaluations(somadas, isApprentice);
  if (pelasAvaliacoes === 'TERMINATED') {
    mudar('previousStatus', existing.status, 'situação anterior');
    mudar('status', 'TERMINATED', 'situação');
    mudar('terminationReason', 'DISPENSA_EXPERIENCIA', 'motivo do desligamento');
    mudar('terminationNotes', 'Demitido na avaliação de experiência (sem linha na aba de demissões)', 'descrição do desligamento');
    return { set, changes, divergencias, evaluations };
  }
  const candidatos = [existing.status, pelasAvaliacoes, plan.status]
    .filter((s): s is Exclude<Status, 'TERMINATED'> => s !== 'TERMINATED');
  const status = candidatos.reduce((a, b) => (ORDEM_STATUS[b] > ORDEM_STATUS[a] ? b : a));
  mudar('status', status, 'situação');
  return { set, changes, divergencias, evaluations };
}
