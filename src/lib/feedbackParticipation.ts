/**
 * Quem participa do ciclo permanente de feedback — lógica pura.
 *
 * Regra do projeto (nov/2026): TODO colaborador cadastrado participa do
 * feedback. O ciclo de cores nasceu como exclusivo dos setores marcados em
 * `sectors.usesColorCycle` (o Salão). O colaborador ATIVO (já na operação, sem
 * treinamento nem experiência) participa em QUALQUER setor: o que decide é a
 * trilha dele, não o setor.
 *
 * O colaborador NOVO continua seguindo a chave do setor — estender o feedback
 * a todos os novos de todos os setores é uma decisão do RH, tomada nesta função
 * quando vier (um lugar só).
 */

export type Trilha = 'NOVO' | 'ATIVO' | null | undefined;

export function usesFeedbackCycle(sectorUsesColorCycle: boolean | null | undefined, track: Trilha): boolean {
  return track === 'ATIVO' || Boolean(sectorUsesColorCycle);
}

/**
 * Devolve o colaborador com `sector.usesColorCycle` já respondendo "este
 * colaborador participa do ciclo de feedback?". As telas e a lógica de
 * `colorUnlock` leem só esse campo; assim a trilha entra sem espalhar a regra
 * por cada componente. Só vale para o payload dos portais — o cadastro do
 * setor (tela de Setores) continua mostrando a chave real.
 */
export function withFeedbackCycle<S extends { usesColorCycle: boolean }, T extends { track?: Trilha; sector?: S | null }>(e: T): T {
  if (!e.sector || e.sector.usesColorCycle || e.track !== 'ATIVO') return e;
  return { ...e, sector: { ...e.sector, usesColorCycle: true } };
}
