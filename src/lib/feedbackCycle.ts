/**
 * Lógica pura do ciclo permanente de feedback — sem I/O, testável isoladamente.
 *
 * Começa depois da avaliação de 90 dias: o gestor classifica o colaborador com
 * uma cor, e a cor define de quantos em quantos dias ele volta a ser avaliado.
 * A cor pode mudar a cada feedback, e a mudança recalcula a próxima data.
 *
 * Complementa `probation.ts`, que cuida da fase anterior (45/90 dias).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type FeedbackColor = 'VERMELHO' | 'AMARELO' | 'VERDE';

export const FEEDBACK_COLORS: FeedbackColor[] = ['VERMELHO', 'AMARELO', 'VERDE'];

/** Intervalo entre feedbacks, em dias, por cor. */
export const COLOR_INTERVAL_DAYS: Record<FeedbackColor, number> = {
  VERMELHO: 45,
  AMARELO: 120,
  VERDE: 180,
};

export const COLOR_LABELS: Record<FeedbackColor, string> = {
  VERMELHO: 'Vermelho',
  AMARELO: 'Amarelo',
  VERDE: 'Verde',
};

export interface ColorOption {
  value: FeedbackColor;
  label: string;
  /** Texto de apoio no formulário, já com o intervalo. */
  description: string;
  className: string;
  dotClassName: string;
}

export const COLOR_OPTIONS: ColorOption[] = [
  {
    value: 'VERMELHO',
    label: 'Vermelho',
    description: 'Acompanhamento mais frequente — novo feedback a cada 45 dias.',
    className: 'text-spot-gray-800',
    dotClassName: 'bg-[#D64545]',
  },
  {
    value: 'AMARELO',
    label: 'Amarelo',
    description: 'Novo feedback a cada 120 dias.',
    className: 'text-spot-gray-800',
    dotClassName: 'bg-[#E8B400]',
  },
  {
    value: 'VERDE',
    label: 'Verde',
    description: 'Novo feedback a cada 180 dias.',
    className: 'text-spot-gray-800',
    dotClassName: 'bg-[#0F7A3D]',
  },
];

export function isFeedbackColor(value: unknown): value is FeedbackColor {
  return typeof value === 'string' && (FEEDBACK_COLORS as string[]).includes(value);
}

/** Meia-noite local — os prazos são dias de calendário, não instantes. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Dias inteiros de calendário entre duas datas (negativo se `to` já passou).
 * Normaliza as horas para que "vence hoje" seja sempre 0, independentemente
 * de a avaliação ter sido salva às 9h ou às 23h.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** Data do próximo feedback a partir da cor definida na avaliação. */
export function nextFeedbackDate(from: Date, color: FeedbackColor): Date {
  return new Date(startOfDay(from).getTime() + COLOR_INTERVAL_DAYS[color] * DAY_MS);
}

/**
 * Data-base do recálculo quando a cor muda FORA de uma avaliação (correção do
 * RH, reclassificação do gestor).
 *
 * - **Primeira classificação** conta de hoje: é o início do ciclo. Sem isso,
 *   quem foi efetivado antes de o ciclo existir já nasceria em atraso.
 * - **Mudança de cor** conta da última avaliação: ajusta a cadência sem zerar
 *   o relógio. Quem está atrasado continua atrasado — trocar a cor não pode
 *   virar atalho para adiar um feedback vencido.
 *
 * Sem avaliação registrada, cai em hoje: não há relógio anterior para manter.
 */
export function colorChangeBaseDate({
  currentColor,
  lastEvaluationDate,
  today = new Date(),
}: {
  currentColor: FeedbackColor | null;
  lastEvaluationDate: Date | null;
  today?: Date;
}): Date {
  if (!currentColor) return today;
  return lastEvaluationDate ?? today;
}

/**
 * Prévia do efeito de uma mudança de cor, para a tela mostrar ANTES de
 * confirmar: nova data e quantos dias isso adianta ou adia.
 */
export function colorChangePreview({
  newColor,
  currentColor,
  lastEvaluationDate,
  currentDueDate,
  today = new Date(),
}: {
  newColor: FeedbackColor;
  currentColor: FeedbackColor | null;
  lastEvaluationDate: Date | null;
  currentDueDate: Date | null;
  today?: Date;
}): { nextDueDate: Date; daysFromToday: number; shiftInDays: number | null } {
  const base = colorChangeBaseDate({ currentColor, lastEvaluationDate, today });
  const nextDueDate = nextFeedbackDate(base, newColor);
  return {
    nextDueDate,
    daysFromToday: daysBetween(today, nextDueDate),
    shiftInDays: currentDueDate ? daysBetween(currentDueDate, nextDueDate) : null,
  };
}

export type FeedbackStatus = 'CONCLUIDA' | 'AGENDADA' | 'PROXIMA' | 'AGUARDANDO' | 'EM_ATRASO';

export interface FeedbackStatusBadge {
  status: FeedbackStatus;
  label: string;
  className: string;
  dotClassName: string;
}

/**
 * Aparência de cada status. As pílulas pastel (`bg-sky-100`, `bg-orange-100`…)
 * saíram: cinco fundos coloridos numa mesma lista faziam todo mundo gritar e
 * ninguém ser ouvido. Ficou o rótulo escrito, com um ponto na cor da escala
 * do projeto — a MESMA do mapa de calor, para o sistema falar uma cor só.
 *
 * Peso e cor de texto só onde há urgência real (atraso). #C93A3A dá 5.06:1
 * sobre branco e #0F7A3D dá 5.42:1 — ambos passam no WCAG AA.
 */
const STATUS_BADGES: Record<FeedbackStatus, Omit<FeedbackStatusBadge, 'status'>> = {
  CONCLUIDA: { label: 'Concluída', className: 'text-[#0F7A3D]', dotClassName: 'bg-[#0F7A3D]' },
  AGENDADA: { label: 'Agendada', className: 'text-spot-gray-600', dotClassName: 'bg-spot-gray-400' },
  PROXIMA: { label: 'Próxima', className: 'text-spot-gray-800', dotClassName: 'bg-[#E8B400]' },
  AGUARDANDO: { label: 'Aguardando avaliação', className: 'text-spot-gray-800', dotClassName: 'bg-[#E27A2E]' },
  EM_ATRASO: { label: 'Em atraso', className: 'text-[#C93A3A] font-semibold', dotClassName: 'bg-[#C93A3A]' },
};

export interface FeedbackCycleState {
  /** Data prevista para o próximo feedback; null quando não há ciclo aberto. */
  nextDueDate: Date | null;
  /** Ciclo encerrado (colaborador desligado, ou feedback já realizado nesta data). */
  completed?: boolean;
}

/**
 * Status do ciclo. "Próxima" usa a mesma janela de 7 dias dos avisos, para que
 * o funcionário só fique amarelo no painel quando o primeiro aviso dispara.
 */
export function feedbackStatus(state: FeedbackCycleState, now: Date = new Date()): FeedbackStatus | null {
  if (state.completed) return 'CONCLUIDA';
  if (!state.nextDueDate) return null;
  const days = daysBetween(now, state.nextDueDate);
  if (days < 0) return 'EM_ATRASO';
  if (days === 0) return 'AGUARDANDO';
  if (days <= 7) return 'PROXIMA';
  return 'AGENDADA';
}

export function feedbackStatusBadge(state: FeedbackCycleState, now: Date = new Date()): FeedbackStatusBadge | null {
  const status = feedbackStatus(state, now);
  if (!status) return null;
  return { status, ...STATUS_BADGES[status] };
}

/**
 * Dias, em relação ao prazo, em que sai um aviso automático: 7, 3 e 1 antes,
 * no próprio dia e depois de vencido (1 e 7 dias de atraso).
 *
 * Os dois últimos entraram com os avisos de avaliação pendente: antes o
 * lembrete parava na véspera, e a avaliação que passava do prazo simplesmente
 * deixava de ser lembrada — justo quando o Gestor Líder mais precisa cobrar.
 */
export const REMINDER_OFFSETS = [7, 3, 1, 0, -1, -7] as const;

export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

/**
 * Antecedência do aviso que deve ser disparado hoje, ou null se hoje não é dia
 * de aviso. Casar por igualdade exata (e não por "<=") é o que impede o mesmo
 * lembrete de ser reenviado todo dia — a idempotência real fica na tabela de
 * notificações, mas a regra de negócio já nasce aqui.
 */
export function dueReminderOffset(dueDate: Date, now: Date = new Date()): ReminderOffset | null {
  const days = daysBetween(now, dueDate);
  return (REMINDER_OFFSETS as readonly number[]).includes(days) ? (days as ReminderOffset) : null;
}

/**
 * Texto do lembrete. `kind` completa "a avaliação ___": "de feedback" no ciclo
 * permanente, "de 45 dias" / "de 90 dias" na experiência.
 */
export function reminderMessage(employeeName: string, offset: ReminderOffset | number, kind = 'de feedback'): string {
  const avaliacao = `a avaliação ${kind} de ${employeeName}`;
  if (offset === 7) return `Atenção: ${avaliacao} está prevista para daqui a 7 dias.`;
  if (offset === 3) return `Lembrete: ${avaliacao} está prevista para daqui a 3 dias.`;
  if (offset === 1) return `Último lembrete: ${avaliacao} será realizada amanhã.`;
  if (offset === 0) return `Hoje é o dia: ${avaliacao} vence hoje.`;
  if (offset === -1) return `Atrasada: ${avaliacao} venceu ontem e ainda não foi registrada.`;
  // Os outros dias só saem pelo "Lembrar gestores agora" do RH; a rotina
  // diária usa apenas REMINDER_OFFSETS.
  if (offset > 1) return `Lembrete: ${avaliacao} está prevista para daqui a ${offset} dias.`;
  return `Atrasada há ${Math.abs(offset)} dias: ${avaliacao} ainda não foi registrada.`;
}
