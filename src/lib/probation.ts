/** Lógica pura do ciclo de experiência (90 dias / 2 ciclos de 45) — sem I/O, testável isoladamente. */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Prazo de cada ciclo = último dia do contrato (45 + 45, a admissão conta como
 * o 1º dia): admissão + 44 e admissão + 89, as mesmas datas do Convênia e do
 * Spot RH. Antes era + 45 / + 90, um dia depois do fim: avaliar na data da
 * tela já caía depois da prorrogação ou, no 2º ciclo, com o contrato virado em
 * indeterminado (CLT art. 445 parágrafo único, art. 451).
 */
export function computeDueDates(admissionDate: Date): { period1DueDate: Date; period2DueDate: Date } {
  return {
    period1DueDate: new Date(admissionDate.getTime() + 44 * DAY_MS),
    period2DueDate: new Date(admissionDate.getTime() + 89 * DAY_MS),
  };
}

export interface DueDateFields {
  status: 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';
  period1DueDate: string;
  period2DueDate: string;
  isApprentice?: boolean;
}

const STATUS_LABELS: Record<DueDateFields['status'], string> = {
  AWAITING_PERIOD_1: 'Aguardando 1º ciclo',
  AWAITING_PERIOD_2: 'Aguardando 2º ciclo',
  HIRED: 'Efetivado',
  TERMINATED: 'Desligado',
};

/** Rótulo da situação. Aprendiz em contrato não é "Efetivado": é aprendiz. */
export function statusLabel(e: Pick<DueDateFields, 'status' | 'isApprentice'>): string {
  if (e.isApprentice && e.status !== 'TERMINATED') return 'Aprendiz';
  return STATUS_LABELS[e.status];
}

/** Prazo do ciclo em aberto (1º ou 2º) — null se o processo já foi concluído. */
export function pendingDueDate(e: DueDateFields): Date | null {
  // Contrato de aprendizagem não tem experiência de 45/90.
  if (e.isApprentice) return null;
  if (e.status === 'AWAITING_PERIOD_1') return new Date(e.period1DueDate);
  if (e.status === 'AWAITING_PERIOD_2') return new Date(e.period2DueDate);
  return null;
}

// ------------------------------------------------------------------
// Calendário. Admissão, prazos e datas de avaliação são DIAS, gravados como
// um instante qualquer daquele dia em UTC (00:00, 12:00 ou 15:00) e exibidos
// com timeZone 'UTC'. "Hoje" é o dia em São Paulo: às 22h de Brasília já é o
// dia seguinte em UTC, e contar por ele marcava como atrasada a avaliação
// feita no último dia do contrato.
// ------------------------------------------------------------------

/** O dia em que uma data gravada cai, como meia-noite UTC desse dia. */
export function utcDay(d: string | Date): number {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/** O dia de hoje (ou de `d`) no calendário de São Paulo, como meia-noite UTC desse dia. */
export function saoPauloDay(d: Date = new Date()): number {
  const [y, m, dia] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d).split('-').map(Number);
  return Date.UTC(y, m - 1, dia);
}

/** "2026-09-29" — hoje em São Paulo, para o valor inicial de um <input type="date">. */
export const saoPauloIsoDate = (d: Date = new Date()) => new Date(saoPauloDay(d)).toISOString().slice(0, 10);

/** Dias até o último dia do prazo: 0 = vence hoje, negativo = atrasado. */
export function daysUntilDueDay(due: string | Date, now: Date = new Date()): number {
  return Math.round((utcDay(due) - saoPauloDay(now)) / DAY_MS);
}

/**
 * A avaliação foi entregue até o último dia do contrato? Compara o DIA, não o
 * horário: avaliar no próprio dia do vencimento está no prazo.
 */
export function deliveredOnTime(evaluationDate: string | Date, dueDate: string | Date): { onTime: boolean; daysLate: number } {
  const daysLate = Math.round((utcDay(evaluationDate) - utcDay(dueDate)) / DAY_MS);
  return { onTime: daysLate <= 0, daysLate: Math.max(0, daysLate) };
}

export interface DueBadge {
  label: string;
  className: string;
}

/**
 * Badge de contagem regressiva/atraso para o prazo em aberto, usado tanto no
 * admin quanto no portal do gestor.
 *
 * As pílulas pastel (`bg-red-100`, `bg-amber-100`) saíram junto com as do
 * resto do sistema: numa lista de doze funcionários eram doze retângulos
 * coloridos, e o que importa — quem está atrasado — se perdia no meio deles.
 * Ficou o texto, com peso e cor só onde há urgência de verdade.
 *
 * `text-[#C93A3A]` dá 5.06:1 sobre branco e `text-spot-gray-800` 12.4:1;
 * ambos passam no WCAG AA (medido com contrastRatio(), ver src/lib/contrast).
 */
export function dueBadge(due: Date | null, now: Date = new Date()): DueBadge | null {
  if (!due) return null;
  // Por dia de calendário, como a Consulta avançada: o prazo é o último dia
  // do contrato, inclusive. Contar em horas errava um dia nas manhãs.
  const days = daysUntilDueDay(due, now);
  if (days < 0) return { label: `Atrasado (${Math.abs(days)}d)`, className: 'text-[#C93A3A] font-semibold' };
  if (days === 0) return { label: 'Vence hoje', className: 'text-spot-gray-800 font-semibold' };
  if (days <= 7) return { label: `Vence em ${days}d`, className: 'text-spot-gray-800 font-semibold' };
  return { label: `Vence em ${days}d`, className: 'text-spot-gray-500' };
}

export type EvaluationConclusion = 'DEMITIR' | 'EFETIVAR' | 'EXTENDER';
export type EvaluationPeriod = 'FIRST' | 'SECOND';
export type EmployeeStatus = 'HIRED' | 'TERMINATED' | 'AWAITING_PERIOD_2';

/**
 * Deriva o novo status do funcionário a partir da conclusão da avaliação.
 * EXTENDER só é válido no 1º ciclo (o formulário original não prevê um 3º
 * ciclo) — chamar com EXTENDER + SECOND é um erro de uso da rota, não uma
 * combinação de negócio válida, por isso lança em vez de silenciosamente
 * empurrar mais uma data.
 */
export function nextStatusAfterConclusion(conclusion: EvaluationConclusion, currentPeriod: EvaluationPeriod): EmployeeStatus {
  if (conclusion === 'DEMITIR') return 'TERMINATED';
  if (conclusion === 'EFETIVAR') return 'HIRED';
  if (currentPeriod === 'SECOND') {
    throw new Error('Não é possível estender o período de experiência além do 2º ciclo.');
  }
  return 'AWAITING_PERIOD_2';
}
