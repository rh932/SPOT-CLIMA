/**
 * Quando a classificação por cor fica disponível para um colaborador — lógica
 * pura, sem I/O, usada pelas rotas e pelas telas dos dois portais.
 *
 * Regra do RH (06/10/2026): a cor só é liberada depois que o colaborador passa
 * pela SEGUNDA avaliação de experiência (90 dias). É individual: o que libera é
 * o histórico daquele colaborador, nunca uma chave geral.
 *
 * O caso que a regra fecha é o de quem foi efetivado já na 1ª avaliação (45
 * dias). Antes ele virava "Efetivado" sem cor e sem data — sumia da fila do
 * gestor — e podia ser classificado direto pela ficha. Agora, num setor do
 * projeto de cores, a 2ª avaliação de experiência continua devida no prazo de
 * 90 dias; é nela que a cor é definida, como acontece com todo mundo.
 */

export type PeriodoAvaliacao = 'FIRST' | 'SECOND' | 'FEEDBACK';

export interface ColorUnlockInput {
  status: 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';
  isApprentice?: boolean | null;
  currentColor: string | null;
  usesColorCycle: boolean;
  evaluations: { period: PeriodoAvaliacao }[];
}

/**
 * A cor já está liberada para este colaborador?
 *
 * - tem a 2ª avaliação de experiência registrada (pelo portal ou pelo Forms);
 * - ou já está no ciclo de feedback (tem cor ou um feedback registrado) — quem
 *   já foi classificado não perde a cor por causa da regra nova.
 */
export function colorUnlocked(e: Pick<ColorUnlockInput, 'currentColor' | 'evaluations'>): boolean {
  if (e.currentColor) return true;
  return e.evaluations.some((ev) => ev.period === 'SECOND' || ev.period === 'FEEDBACK');
}

/**
 * Efetivado na 1ª avaliação, num setor do projeto de cores, e ainda sem a 2ª:
 * a avaliação de 90 dias continua devida (prazo = period2DueDate).
 */
export function awaitsSecondEvaluation(e: ColorUnlockInput): boolean {
  return e.status === 'HIRED' && !e.isApprentice && e.usesColorCycle && !colorUnlocked(e);
}

/**
 * Qual avaliação é a próxima deste colaborador. Mesma resposta no servidor (que
 * decide o período — ele nunca vem do cliente) e na tela (que monta o
 * formulário). Null quando não há avaliação a fazer.
 */
export function nextEvaluationPeriod(e: ColorUnlockInput): PeriodoAvaliacao | null {
  if (e.isApprentice || e.status === 'TERMINATED') return null;
  if (e.status === 'AWAITING_PERIOD_1') return 'FIRST';
  if (e.status === 'AWAITING_PERIOD_2') return 'SECOND';
  if (awaitsSecondEvaluation(e)) return 'SECOND';
  return 'FEEDBACK';
}

/** Mensagem única para quando alguém tenta classificar antes da hora. */
export const COR_BLOQUEADA_MSG =
  'A classificação por cor só é liberada depois da 2ª avaliação de experiência (90 dias) deste colaborador.';
