/**
 * Regras puras do cadastro de colaborador — sem I/O, testáveis isoladamente.
 * Usadas pelas duas portas de cadastro (admin e portal da operação).
 */
import { computeDueDates } from './probation';

export type EmployeeTrack = 'NOVO' | 'ATIVO';

export const TRACK_LABELS: Record<EmployeeTrack, string> = {
  NOVO: 'Colaborador novo',
  ATIVO: 'Colaborador ativo',
};

export const TRACK_HINTS: Record<EmployeeTrack, string> = {
  NOVO: 'Recém-admitido: segue treinamento (quando o setor tem), avaliações de experiência e feedback.',
  ATIVO: 'Já faz parte da operação: não passa por treinamento nem experiência, só pelo feedback.',
};

/** Nome sem acento, em minúsculas e com espaços colapsados — a chave de comparação. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Procura, entre os colaboradores da MESMA unidade, algum com o mesmo nome
 * (ignorando acento, caixa e espaços). Homônimos de outra unidade não contam.
 */
export function findDuplicate<T extends { fullName: string; unitId: string }>(
  candidates: T[],
  input: { fullName: string; unitId: string },
): T | null {
  const key = normalizeName(input.fullName);
  return candidates.find((c) => c.unitId === input.unitId && normalizeName(c.fullName) === key) ?? null;
}

/**
 * Campos de ciclo de um colaborador novo, conforme a trilha.
 * - NOVO: entra aguardando a 1ª avaliação (ou efetivado, se for aprendiz).
 * - ATIVO: entra como efetivado — não tem experiência a cumprir — e com o 1º feedback vencendo hoje. Os prazos
 *   de 45/90 continuam calculados (as colunas são obrigatórias), mas nunca
 *   geram pendência porque o status não é AWAITING_*.
 */
export function cycleFieldsFor(track: EmployeeTrack, admissionDate: Date, isApprentice = false, now: Date = new Date()) {
  const { period1DueDate, period2DueDate } = computeDueDates(admissionDate);
  const hired = track === 'ATIVO' || isApprentice;
  return {
    track,
    period1DueDate,
    period2DueDate,
    isApprentice,
    ...(hired ? { status: 'HIRED' as const } : {}),
    // ATIVO participa do feedback desde já: o 1º vence hoje, e é nele que o
    // gestor define a cor (e com ela a cadência dos próximos).
    ...(track === 'ATIVO' && !isApprentice ? { nextFeedbackDueDate: now } : {}),
  };
}
