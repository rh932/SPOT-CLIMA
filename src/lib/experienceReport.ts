/**
 * Quadro da avaliação de experiência — o que a planilha "Quadro de Admissões"
 * do DP mostrava, calculado a partir do cadastro e das avaliações.
 *
 * Lógica pura, usada nos dois lados: a tela filtra no navegador e a rota de
 * exportação filtra no servidor com exatamente a mesma regra, a partir dos
 * mesmos parâmetros da URL. Assim o Excel baixado é a lista que está na tela.
 */

import { deliveredOnTime, saoPauloDay, utcDay } from './probation';
import { TERMINATION_LABELS, type TerminationReason } from './termination';

type Status = 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';
type Period = 'FIRST' | 'SECOND' | 'FEEDBACK';
export type Conclusion = 'DEMITIR' | 'EFETIVAR' | 'EXTENDER';
export type Classification = 'FRACO' | 'ALGUMAS_POSSIBILIDADES' | 'OTIMAS_PERSPECTIVAS' | 'EXCELENTE_AQUISICAO';

export interface ReportEvaluationInput {
  id: string;
  period: Period;
  cycleNumber: number;
  conclusion: Conclusion | null;
  classification: Classification;
  evaluationDate: string | Date;
  dueDateAtEvaluation: string | Date;
  source?: 'SISTEMA' | 'FORMS';
  evaluatorName?: string | null;
  evaluator?: { name: string } | null;
}

export interface ReportEmployeeInput {
  id: string;
  fullName: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  admissionDate: string | Date;
  period1DueDate: string | Date;
  period2DueDate: string | Date;
  status: Status;
  isApprentice?: boolean;
  terminationReason?: TerminationReason | null;
  terminationDate?: string | Date | null;
  sector: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
  evaluations: ReportEvaluationInput[];
}

/**
 * Situação de um período da experiência, na linguagem da planilha:
 * - NO_PRAZO / FORA_DO_PRAZO: avaliação entregue (a 1ª resposta decide);
 * - PENDENTE: ainda dentro do contrato, sem resposta;
 * - ATRASADA: contrato acabou e a avaliação não veio;
 * - NAO_SE_APLICA: aprendiz, saiu antes, ou efetivado/demitido no 1º período.
 */
export type PeriodState = 'NO_PRAZO' | 'FORA_DO_PRAZO' | 'PENDENTE' | 'ATRASADA' | 'NAO_SE_APLICA';

export const PERIOD_STATE_LABELS: Record<PeriodState, string> = {
  NO_PRAZO: 'Entregue no prazo',
  FORA_DO_PRAZO: 'Entregue fora do prazo',
  PENDENTE: 'Pendente',
  ATRASADA: 'Atrasada',
  NAO_SE_APLICA: 'Não se aplica',
};

export const CONCLUSION_LABELS: Record<Conclusion, string> = {
  EFETIVAR: 'Efetivar',
  EXTENDER: '+45 dias',
  DEMITIR: 'Demitir',
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  FRACO: 'Fraco',
  ALGUMAS_POSSIBILIDADES: 'Algumas possibilidades',
  OTIMAS_PERSPECTIVAS: 'Ótimas perspectivas',
  EXCELENTE_AQUISICAO: 'Excelente aquisição',
};

/** 1 a 4, a mesma escala do quadro do DP (coluna "CLASSIF."). */
export const CLASSIFICATION_SCORE: Record<Classification, number> = {
  FRACO: 1, ALGUMAS_POSSIBILIDADES: 2, OTIMAS_PERSPECTIVAS: 3, EXCELENTE_AQUISICAO: 4,
};

export type Situation = 'AGUARDANDO_1' | 'AGUARDANDO_2' | 'EFETIVADO' | 'DESLIGADO' | 'APRENDIZ';

export const SITUATION_LABELS: Record<Situation, string> = {
  AGUARDANDO_1: 'Aguardando 1º ciclo',
  AGUARDANDO_2: 'Aguardando 2º ciclo',
  EFETIVADO: 'Efetivado',
  DESLIGADO: 'Desligado',
  APRENDIZ: 'Aprendiz',
};

export interface PeriodCell {
  state: PeriodState;
  due: Date;
  /** Dias de atraso (entregue fora do prazo ou atrasada) ou que faltam (pendente). */
  days: number;
  evaluations: {
    id: string;
    date: Date;
    conclusion: Conclusion | null;
    classification: Classification;
    evaluator: string | null;
    onTime: boolean;
    daysLate: number;
    source: 'SISTEMA' | 'FORMS';
  }[];
}

export interface ReportRow {
  id: string;
  fullName: string;
  role: string;
  shift: 'DIA' | 'NOITE';
  unitId: string | null;
  unit: string;
  sectorId: string | null;
  sector: string;
  admission: Date;
  situation: Situation;
  isApprentice: boolean;
  period1: PeriodCell;
  period2: PeriodCell;
  /** A avaliação de experiência mais recente — é a que decide. */
  lastClassification: Classification | null;
  lastConclusion: Conclusion | null;
  evaluators: string[];
  terminationReason: TerminationReason | null;
  terminationDate: Date | null;
  /** Prazo em aberto (pendente ou atrasado) e quantos dias faltam (negativo = atrasado). */
  openDue: { period: 1 | 2; due: Date; days: number } | null;
  /**
   * Como a experiência terminou, para a taxa de efetivação: quem foi efetivado
   * e saiu meses depois conta como efetivado, não como desligado. Nulo
   * enquanto a experiência está em curso e para aprendiz.
   */
  outcome: 'EFETIVADO' | 'DESLIGADO_NA_EXPERIENCIA' | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Dia de uma data gravada (admissão, prazo, avaliação), como meia-noite UTC. */
const dia = utcDay;

function situationOf(e: ReportEmployeeInput): Situation {
  if (e.status === 'TERMINATED') return 'DESLIGADO';
  if (e.isApprentice) return 'APRENDIZ';
  if (e.status === 'AWAITING_PERIOD_1') return 'AGUARDANDO_1';
  if (e.status === 'AWAITING_PERIOD_2') return 'AGUARDANDO_2';
  return 'EFETIVADO';
}

function periodCell(e: ReportEmployeeInput, p: 1 | 2, hoje: number): PeriodCell {
  const due = new Date(p === 1 ? e.period1DueDate : e.period2DueDate);
  const period: Period = p === 1 ? 'FIRST' : 'SECOND';
  const evaluations = e.evaluations
    .filter((ev) => ev.period === period)
    .sort((a, b) => dia(a.evaluationDate) - dia(b.evaluationDate) || a.cycleNumber - b.cycleNumber)
    .map((ev) => {
      const { onTime, daysLate } = deliveredOnTime(ev.evaluationDate, ev.dueDateAtEvaluation);
      return {
        id: ev.id,
        date: new Date(ev.evaluationDate),
        conclusion: ev.conclusion,
        classification: ev.classification,
        evaluator: ev.evaluator?.name ?? ev.evaluatorName ?? null,
        onTime,
        daysLate,
        source: ev.source ?? 'SISTEMA',
      };
    });

  if (evaluations.length) {
    const primeira = evaluations[0];
    return { state: primeira.onTime ? 'NO_PRAZO' : 'FORA_DO_PRAZO', due, days: primeira.daysLate, evaluations };
  }

  const naoSeAplica: PeriodCell = { state: 'NAO_SE_APLICA', due, days: 0, evaluations };
  if (e.isApprentice) return naoSeAplica;
  if (e.status === 'TERMINATED') return naoSeAplica;
  if (e.status === 'HIRED') return naoSeAplica;
  // O 2º período só existe para quem foi prorrogado no 1º.
  if (p === 2 && e.status !== 'AWAITING_PERIOD_2') return naoSeAplica;
  if (p === 1 && e.status === 'AWAITING_PERIOD_2') return naoSeAplica;

  const falta = Math.round((dia(due) - hoje) / DAY_MS);
  return falta < 0
    ? { state: 'ATRASADA', due, days: -falta, evaluations }
    : { state: 'PENDENTE', due, days: falta, evaluations };
}

export function buildReportRow(e: ReportEmployeeInput, now: Date = new Date()): ReportRow {
  // "Hoje" é o dia em São Paulo, no navegador e no servidor (que roda em UTC):
  // às 22h de Brasília o dia UTC já é amanhã, e o último dia do contrato
  // apareceria como atrasado.
  const hoje = saoPauloDay(now);
  const period1 = periodCell(e, 1, hoje);
  const period2 = periodCell(e, 2, hoje);
  const experiencia = e.evaluations
    .filter((ev) => ev.period !== 'FEEDBACK')
    .sort((a, b) => {
      const ordem = (x: Period) => (x === 'SECOND' ? 1 : 0);
      return ordem(a.period) - ordem(b.period) || dia(a.evaluationDate) - dia(b.evaluationDate) || a.cycleNumber - b.cycleNumber;
    });
  const ultima = experiencia[experiencia.length - 1];
  const aberto = [period1, period2].findIndex((c) => c.state === 'PENDENTE' || c.state === 'ATRASADA');
  const celula = aberto === 0 ? period1 : aberto === 1 ? period2 : null;
  const situation = situationOf(e);
  const lastConclusion = ultima?.conclusion ?? null;

  // Desligado por "Demitir" numa avaliação feita pelo portal não tem motivo
  // gravado; para filtro e Excel ele é uma dispensa na experiência, como os
  // mesmos casos que vieram do Forms.
  const terminationReason: TerminationReason | null = e.terminationReason
    ?? (situation === 'DESLIGADO' && lastConclusion === 'DEMITIR' ? 'DISPENSA_EXPERIENCIA' : null);

  let outcome: ReportRow['outcome'] = null;
  if (!e.isApprentice) {
    if (situation === 'EFETIVADO') outcome = 'EFETIVADO';
    else if (situation === 'DESLIGADO') {
      const efetivadoAntes = lastConclusion === 'EFETIVAR'
        || e.evaluations.some((ev) => ev.period === 'SECOND' && ev.conclusion !== 'DEMITIR')
        || (e.terminationDate ? dia(e.terminationDate) > dia(e.period2DueDate) : false);
      outcome = efetivadoAntes ? 'EFETIVADO' : 'DESLIGADO_NA_EXPERIENCIA';
    }
  }

  return {
    id: e.id,
    fullName: e.fullName,
    role: e.roleDescription,
    shift: e.shift,
    unitId: e.unit?.id ?? null,
    unit: e.unit?.name ?? '—',
    sectorId: e.sector?.id ?? null,
    sector: e.sector?.name ?? '—',
    admission: new Date(e.admissionDate),
    situation,
    isApprentice: Boolean(e.isApprentice),
    period1,
    period2,
    lastClassification: ultima?.classification ?? null,
    lastConclusion,
    evaluators: [...new Set(experiencia.map((ev) => ev.evaluator?.name ?? ev.evaluatorName).filter((n): n is string => Boolean(n)))],
    terminationReason,
    terminationDate: e.terminationDate ? new Date(e.terminationDate) : null,
    openDue: celula
      ? { period: aberto === 0 ? 1 : 2, due: celula.due, days: celula.state === 'ATRASADA' ? -celula.days : celula.days }
      : null,
    outcome,
  };
}

// ------------------------------------------------------------------
// Filtros — serializáveis na URL (?unidade=..&setor=..)
// ------------------------------------------------------------------

export type DeadlineFilter = 'ATRASADA' | 'VENCE_7' | 'VENCE_30' | 'SEM_PENDENCIA';
export type DeliveryFilter = 'NO_PRAZO' | 'FORA_DO_PRAZO' | 'SEM_AVALIACAO';

export interface ReportFilters {
  q: string;
  units: string[];
  sectors: string[];
  shifts: ('DIA' | 'NOITE')[];
  situations: Situation[];
  admissionFrom: string; // yyyy-mm-dd
  admissionTo: string;
  deadline: DeadlineFilter | '';
  /** Entrega de qual período: 1, 2 ou qualquer um. */
  deliveryPeriod: '1' | '2' | '';
  delivery: DeliveryFilter | '';
  conclusions: (Conclusion | 'SEM')[];
  classifications: (Classification | 'SEM')[];
  evaluator: string;
  terminationReasons: TerminationReason[];
  multipleEvaluators: boolean;
}

export const EMPTY_FILTERS: ReportFilters = {
  q: '', units: [], sectors: [], shifts: [], situations: [], admissionFrom: '', admissionTo: '',
  deadline: '', deliveryPeriod: '', delivery: '', conclusions: [], classifications: [], evaluator: '',
  terminationReasons: [], multipleEvaluators: false,
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function deliveryMatches(c: PeriodCell, f: DeliveryFilter): boolean {
  if (f === 'NO_PRAZO') return c.state === 'NO_PRAZO';
  if (f === 'FORA_DO_PRAZO') return c.state === 'FORA_DO_PRAZO';
  return c.state === 'PENDENTE' || c.state === 'ATRASADA';
}

export function matchesFilters(r: ReportRow, f: ReportFilters): boolean {
  if (f.q) {
    const q = norm(f.q);
    if (!norm(r.fullName).includes(q) && !norm(r.role).includes(q)) return false;
  }
  if (f.units.length && !f.units.includes(r.unitId ?? '')) return false;
  if (f.sectors.length && !f.sectors.includes(r.sectorId ?? '')) return false;
  if (f.shifts.length && !f.shifts.includes(r.shift)) return false;
  if (f.situations.length && !f.situations.includes(r.situation)) return false;
  const adm = r.admission.toISOString().slice(0, 10);
  if (f.admissionFrom && adm < f.admissionFrom) return false;
  if (f.admissionTo && adm > f.admissionTo) return false;

  if (f.deadline) {
    const d = r.openDue?.days;
    if (f.deadline === 'SEM_PENDENCIA' && r.openDue) return false;
    if (f.deadline === 'ATRASADA' && !(d !== undefined && d < 0)) return false;
    if (f.deadline === 'VENCE_7' && !(d !== undefined && d >= 0 && d <= 7)) return false;
    if (f.deadline === 'VENCE_30' && !(d !== undefined && d >= 0 && d <= 30)) return false;
  }

  if (f.delivery) {
    const celulas = f.deliveryPeriod === '1' ? [r.period1] : f.deliveryPeriod === '2' ? [r.period2] : [r.period1, r.period2];
    if (!celulas.some((c) => deliveryMatches(c, f.delivery as DeliveryFilter))) return false;
  }

  if (f.conclusions.length && !f.conclusions.includes(r.lastConclusion ?? 'SEM')) return false;
  if (f.classifications.length && !f.classifications.includes(r.lastClassification ?? 'SEM')) return false;
  if (f.evaluator && !r.evaluators.some((n) => norm(n) === norm(f.evaluator))) return false;
  if (f.terminationReasons.length && !(r.terminationReason && f.terminationReasons.includes(r.terminationReason))) return false;
  if (f.multipleEvaluators) {
    const mais = [r.period1, r.period2].some((c) => new Set(c.evaluations.map((ev) => ev.evaluator)).size > 1);
    if (!mais) return false;
  }
  return true;
}

export function activeFilterCount(f: ReportFilters): number {
  return [
    f.q, f.units.length, f.sectors.length, f.shifts.length, f.situations.length, f.admissionFrom || f.admissionTo,
    f.deadline, f.delivery, f.conclusions.length, f.classifications.length, f.evaluator, f.terminationReasons.length,
    f.multipleEvaluators,
  ].filter(Boolean).length;
}

const LISTAS = ['units', 'sectors', 'shifts', 'situations', 'conclusions', 'classifications', 'terminationReasons'] as const;
const TEXTOS = ['q', 'admissionFrom', 'admissionTo', 'deadline', 'deliveryPeriod', 'delivery', 'evaluator'] as const;

/** Parâmetros de URL que pertencem à consulta — o resto da query é preservado. */
export const CONSULTA_PARAM_KEYS: string[] = [...TEXTOS, ...LISTAS, 'multipleEvaluators'];

export function filtersToParams(f: ReportFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of TEXTOS) if (f[k]) p.set(k, f[k]);
  for (const k of LISTAS) if (f[k].length) p.set(k, (f[k] as string[]).join(','));
  if (f.multipleEvaluators) p.set('multipleEvaluators', '1');
  return p;
}

export function filtersFromParams(p: URLSearchParams): ReportFilters {
  const f: ReportFilters = { ...EMPTY_FILTERS };
  for (const k of TEXTOS) {
    const v = p.get(k);
    if (v) (f as unknown as Record<string, string>)[k] = v.slice(0, 120);
  }
  for (const k of LISTAS) {
    const v = p.get(k);
    if (v) (f as unknown as Record<string, string[]>)[k] = v.split(',').filter(Boolean).slice(0, 50);
  }
  f.multipleEvaluators = p.get('multipleEvaluators') === '1';
  return f;
}

// ------------------------------------------------------------------
// Ordenação e totais
// ------------------------------------------------------------------

export type SortKey = 'nome' | 'admissao' | 'prazo' | 'loja' | 'setor' | 'classificacao';

export function sortRows(rows: ReportRow[], key: SortKey, dir: 'asc' | 'desc'): ReportRow[] {
  const s = dir === 'asc' ? 1 : -1;
  const val = (r: ReportRow): string | number => {
    switch (key) {
      case 'nome': return norm(r.fullName);
      case 'admissao': return r.admission.getTime();
      // Sem prazo em aberto vai para o fim em qualquer direção.
      case 'prazo': return r.openDue ? r.openDue.days : Number.POSITIVE_INFINITY * s;
      case 'loja': return norm(r.unit);
      case 'setor': return norm(r.sector);
      case 'classificacao': return r.lastClassification ? CLASSIFICATION_SCORE[r.lastClassification] : 0;
    }
  };
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1 * s;
    if (va > vb) return 1 * s;
    return norm(a.fullName) < norm(b.fullName) ? -1 : 1;
  });
}

export interface ReportSummary {
  total: number;
  bySituation: Record<Situation, number>;
  byUnit: { name: string; count: number }[];
  bySector: { name: string; count: number }[];
  /** Entregas de avaliação (1ª resposta de cada período) no prazo / total entregue. */
  deliveredOnTime: number;
  delivered: number;
  overdue: number;
  /** Efetivados / quem já teve desfecho na experiência (sem aprendiz). Quem foi efetivado e saiu depois conta como efetivado. */
  hireRate: number | null;
  averageClassification: number | null;
}

export function summarize(rows: ReportRow[]): ReportSummary {
  const bySituation: Record<Situation, number> = { AGUARDANDO_1: 0, AGUARDANDO_2: 0, EFETIVADO: 0, DESLIGADO: 0, APRENDIZ: 0 };
  const units = new Map<string, number>();
  const sectors = new Map<string, number>();
  let delivered = 0;
  let onTime = 0;
  let overdue = 0;
  let somaClass = 0;
  let nClass = 0;
  let desfechoEfetivado = 0;
  let desfechoDesligado = 0;
  for (const r of rows) {
    bySituation[r.situation] += 1;
    units.set(r.unit, (units.get(r.unit) ?? 0) + 1);
    sectors.set(r.sector, (sectors.get(r.sector) ?? 0) + 1);
    for (const c of [r.period1, r.period2]) {
      if (c.state === 'NO_PRAZO' || c.state === 'FORA_DO_PRAZO') {
        delivered += 1;
        if (c.state === 'NO_PRAZO') onTime += 1;
      }
      if (c.state === 'ATRASADA') overdue += 1;
    }
    if (r.lastClassification) { somaClass += CLASSIFICATION_SCORE[r.lastClassification]; nClass += 1; }
    if (r.outcome === 'EFETIVADO') desfechoEfetivado += 1;
    if (r.outcome === 'DESLIGADO_NA_EXPERIENCIA') desfechoDesligado += 1;
  }
  const ordenar = (m: Map<string, number>) => [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const desfechos = desfechoEfetivado + desfechoDesligado;
  return {
    total: rows.length,
    bySituation,
    byUnit: ordenar(units),
    bySector: ordenar(sectors),
    deliveredOnTime: onTime,
    delivered,
    overdue,
    hireRate: desfechos ? desfechoEfetivado / desfechos : null,
    averageClassification: nClass ? somaClass / nClass : null,
  };
}

/** Texto curto de uma célula de período, para tabela e Excel. */
export function periodText(c: PeriodCell): string {
  switch (c.state) {
    case 'NO_PRAZO': return 'No prazo';
    case 'FORA_DO_PRAZO': return `Fora do prazo (+${c.days}d)`;
    case 'PENDENTE': return c.days === 0 ? 'Vence hoje' : `Vence em ${c.days}d`;
    case 'ATRASADA': return `Atrasada (${c.days}d)`;
    default: return '—';
  }
}

export const terminationLabel = (r: TerminationReason | null) => (r ? TERMINATION_LABELS[r] : '');
