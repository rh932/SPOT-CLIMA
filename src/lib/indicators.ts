/**
 * Indicadores da avaliação de experiência — a visão consolidada que faltava:
 * a consulta avançada responde "quem", aqui a pergunta é "como estamos indo".
 *
 * - Evolução mês a mês por mês de admissão: quantos entraram, quantos foram
 *   efetivados, quantos saíram na experiência e a taxa de efetivação.
 * - Por loja e por setor: efetivação, entrega no prazo e atrasos de hoje.
 * - Por gestor: pontualidade das avaliações que ele fez (experiência e
 *   feedback) e quantas estão atrasadas ou vencendo no escopo dele agora —
 *   é a lista para cobrar.
 *
 * Puro, sem banco: recebe as linhas já montadas por buildReportRow
 * (src/lib/experienceReport.ts), as avaliações e os gestores com escopo.
 */

import type { ReportRow } from './experienceReport';
import { deliveredOnTime, saoPauloDay, utcDay } from './probation';
import { isInScope, type GestorScope } from './scope';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IndicatorEvaluation {
  evaluatorAdminId: string | null;
  period: 'FIRST' | 'SECOND' | 'FEEDBACK';
  evaluationDate: string | Date;
  dueDateAtEvaluation: string | Date;
}

export interface IndicatorManager {
  id: string;
  name: string;
  role: string;
  scope: GestorScope;
}

export interface IndicatorDueItem {
  /** Funcionário com prazo em aberto (experiência ou feedback). */
  unitId: string;
  sectorId: string;
  shift: string;
  /** Dias até o prazo (negativo = atrasado). */
  days: number;
}

export interface MonthPoint {
  month: string; // AAAA-MM
  admitted: number;
  hired: number;
  dismissed: number;
  ongoing: number;
  /** Efetivados / (efetivados + desligados na experiência). Nulo sem desfecho no mês. */
  hireRate: number | null;
}

export interface GroupIndicator {
  name: string;
  total: number;
  hireRate: number | null;
  delivered: number;
  onTimeRate: number | null;
  overdueNow: number;
}

export interface ManagerIndicator {
  id: string;
  name: string;
  role: string;
  evaluations: number;
  onTime: number;
  onTimeRate: number | null;
  /** Média de dias de atraso das que saíram fora do prazo. */
  avgDaysLate: number | null;
  overdueNow: number;
  dueSoon: number;
}

export interface IndicatorsResult {
  months: MonthPoint[];
  byUnit: GroupIndicator[];
  bySector: GroupIndicator[];
  managers: ManagerIndicator[];
  totals: { admitted: number; hireRate: number | null; onTimeRate: number | null; overdueNow: number };
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Os últimos `n` meses (AAAA-MM) até o mês de `now`, do mais antigo para o mais novo. */
export function lastMonths(now: Date, n: number): string[] {
  const out: string[] = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

function groupBy(rows: ReportRow[], key: (r: ReportRow) => string): GroupIndicator[] {
  const map = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([name, rs]) => {
      let hired = 0;
      let dismissed = 0;
      let delivered = 0;
      let onTime = 0;
      let overdueNow = 0;
      for (const r of rs) {
        if (r.outcome === 'EFETIVADO') hired++;
        if (r.outcome === 'DESLIGADO_NA_EXPERIENCIA') dismissed++;
        for (const c of [r.period1, r.period2]) {
          if (c.state === 'NO_PRAZO' || c.state === 'FORA_DO_PRAZO') delivered++;
          if (c.state === 'NO_PRAZO') onTime++;
          if (c.state === 'ATRASADA') overdueNow++;
        }
      }
      return {
        name,
        total: rs.filter((r) => !r.isApprentice).length,
        hireRate: ratio(hired, hired + dismissed),
        delivered,
        onTimeRate: ratio(onTime, delivered),
        overdueNow,
      };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
}

export function computeIndicators(input: {
  rows: ReportRow[];
  evaluations: IndicatorEvaluation[];
  managers: IndicatorManager[];
  /** Prazos em aberto de hoje (experiência e feedback), para a cobrança por gestor. */
  openDues: IndicatorDueItem[];
  now?: Date;
  months?: number;
}): IndicatorsResult {
  const now = input.now ?? new Date();
  // O mês corrente é o de São Paulo: no dia 1º às 22h o UTC já está no mês seguinte.
  const meses = lastMonths(new Date(saoPauloDay(now)), input.months ?? 12);
  const inicio = utcDay(`${meses[0]}-01`);
  const semAprendiz = input.rows.filter((r) => !r.isApprentice);

  // --- Mês a mês, pelo mês de admissão --------------------------------------
  const porMes = new Map(meses.map((m) => [m, { admitted: 0, hired: 0, dismissed: 0, ongoing: 0 }]));
  for (const r of semAprendiz) {
    const p = porMes.get(monthOf(r.admission));
    if (!p) continue;
    p.admitted++;
    if (r.outcome === 'EFETIVADO') p.hired++;
    else if (r.outcome === 'DESLIGADO_NA_EXPERIENCIA') p.dismissed++;
    else p.ongoing++;
  }
  const months: MonthPoint[] = meses.map((month) => {
    const p = porMes.get(month)!;
    return { month, ...p, hireRate: ratio(p.hired, p.hired + p.dismissed) };
  });

  // --- Por gestor --------------------------------------------------------------
  // Só quem avalia (GESTOR) entra na régua de pontualidade; o Gestor Líder
  // acompanha e aparece na cobrança do escopo, mas não "deve" avaliação.
  const managers: ManagerIndicator[] = input.managers
    .map((m) => {
      const minhas = input.evaluations.filter(
        (e) => e.evaluatorAdminId === m.id && utcDay(e.evaluationDate) >= inicio,
      );
      let onTime = 0;
      let somaAtraso = 0;
      let atrasadas = 0;
      for (const e of minhas) {
        const r = deliveredOnTime(e.evaluationDate, e.dueDateAtEvaluation);
        if (r.onTime) onTime++;
        else { atrasadas++; somaAtraso += r.daysLate; }
      }
      const noEscopo = input.openDues.filter((d) => isInScope(m.scope, d));
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        evaluations: minhas.length,
        onTime,
        onTimeRate: ratio(onTime, minhas.length),
        avgDaysLate: atrasadas ? Math.round((somaAtraso / atrasadas) * 10) / 10 : null,
        overdueNow: noEscopo.filter((d) => d.days < 0).length,
        dueSoon: noEscopo.filter((d) => d.days >= 0 && d.days <= 7).length,
      };
    })
    // Primeiro quem tem atraso agora; depois a pior pontualidade.
    .sort((a, b) => b.overdueNow - a.overdueNow
      || (a.onTimeRate ?? 2) - (b.onTimeRate ?? 2)
      || a.name.localeCompare(b.name, 'pt-BR'));

  // --- Totais ------------------------------------------------------------------
  const desfecho = semAprendiz.filter((r) => r.outcome !== null);
  const hired = desfecho.filter((r) => r.outcome === 'EFETIVADO').length;
  let delivered = 0;
  let onTime = 0;
  for (const r of semAprendiz) {
    for (const c of [r.period1, r.period2]) {
      if (c.state === 'NO_PRAZO' || c.state === 'FORA_DO_PRAZO') delivered++;
      if (c.state === 'NO_PRAZO') onTime++;
    }
  }

  return {
    months,
    byUnit: groupBy(input.rows, (r) => r.unit),
    bySector: groupBy(input.rows, (r) => r.sector),
    managers,
    totals: {
      admitted: months.reduce((s, m) => s + m.admitted, 0),
      hireRate: ratio(hired, desfecho.length),
      onTimeRate: ratio(onTime, delivered),
      overdueNow: input.openDues.filter((d) => d.days < 0).length,
    },
  };
}

/** Dias até um prazo, contando em dias de calendário (negativo = atrasado). */
export function daysUntil(due: string | Date, todayUtcDay: number): number {
  return Math.round((utcDay(due) - todayUtcDay) / DAY_MS);
}
