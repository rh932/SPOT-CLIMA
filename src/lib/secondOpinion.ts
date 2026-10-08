import { saoPauloDay, utcDay } from './probation';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Segunda resposta do mesmo período de experiência.
 *
 * Alguns setores têm dois gestores no turno, e os dois às vezes avaliam o
 * mesmo período (era assim no Google Forms). Depois que o primeiro responde,
 * a situação já andou — o 1º período some da fila —, então o segundo gestor
 * precisa de uma porta própria: avaliar de novo o período que acabou de ser
 * respondido, sem mexer no próximo.
 *
 * A porta fecha quando: o próprio gestor já respondeu aquele período; o RH
 * registrou o desligamento; o período seguinte já foi avaliado; ou passaram
 * SEGUNDA_RESPOSTA_DIAS desde a primeira resposta.
 */

export const SEGUNDA_RESPOSTA_DIAS = 30;

export interface EvaluationForSecondOpinion {
  period: 'FIRST' | 'SECOND' | 'FEEDBACK';
  evaluatorAdminId: string | null;
  evaluationDate: string | Date;
  conclusion: 'DEMITIR' | 'EFETIVAR' | 'EXTENDER' | null;
}

export interface SecondOpinionTarget {
  isApprentice?: boolean;
  terminationDate?: string | Date | null;
}

export interface SecondOpinion {
  period: 'FIRST' | 'SECOND';
  /** A resposta que abriu o período (a mais antiga). */
  first: EvaluationForSecondOpinion;
  /** Último dia para responder. */
  until: Date;
}

export function secondOpinionFor(
  employee: SecondOpinionTarget,
  evaluations: EvaluationForSecondOpinion[],
  adminId: string,
  now: Date = new Date(),
): SecondOpinion | null {
  if (employee.isApprentice || employee.terminationDate) return null;
  if (evaluations.some((e) => e.period === 'FEEDBACK')) return null;

  const period = evaluations.some((e) => e.period === 'SECOND') ? 'SECOND'
    : evaluations.some((e) => e.period === 'FIRST') ? 'FIRST' : null;
  if (!period) return null;

  const doPeriodo = evaluations
    .filter((e) => e.period === period)
    .sort((a, b) => utcDay(a.evaluationDate) - utcDay(b.evaluationDate));
  if (doPeriodo.some((e) => e.evaluatorAdminId === adminId)) return null;

  const first = doPeriodo[0];
  const until = new Date(utcDay(first.evaluationDate) + SEGUNDA_RESPOSTA_DIAS * DAY_MS);
  if (saoPauloDay(now) > until.getTime()) return null;
  return { period, first, until };
}
