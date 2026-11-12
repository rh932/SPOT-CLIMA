/**
 * Quem participa do feedback e das cores — lógica pura.
 *
 * Regra do projeto (nov/2026): é o SETOR que opta (tela de Setores):
 *  - `usesFeedback`: faz feedback dos colaboradores já efetivados, quando o gestor
 *    quiser (sem data agendada nem aviso).
 *  - `usesColorCycle`: além disso, classifica por cor e agenda o próximo feedback
 *    (🔴45 / 🟡120 / 🟢180 dias). Quem usa cores sempre faz feedback.
 *
 * A trilha do colaborador (NOVO/ATIVO) deixou de decidir: antes o ATIVO participava
 * em qualquer setor; a migração 0029 ligou as chaves dos setores que já tinham ATIVO.
 */

export type Trilha = 'NOVO' | 'ATIVO' | null | undefined;

interface SetorChaves { usesColorCycle?: boolean | null; usesFeedback?: boolean | null }

/** O colaborador entra no ciclo de CORES (classificação + data do próximo feedback)? */
export function usesFeedbackCycle(sectorUsesColorCycle: boolean | null | undefined, _track?: Trilha): boolean {
  return Boolean(sectorUsesColorCycle);
}

/** O setor faz feedback (com ou sem cores)? */
export function sectorDoesFeedback(sector: SetorChaves | null | undefined): boolean {
  return Boolean(sector?.usesFeedback || sector?.usesColorCycle);
}

/**
 * Mantido por compatibilidade com as rotas/telas que chamam: devolve o colaborador
 * com `sector.usesFeedback` já consolidado (cores implicam feedback).
 */
export function withFeedbackCycle<S extends { usesColorCycle: boolean; usesFeedback?: boolean }, T extends { track?: Trilha; sector?: S | null }>(e: T): T {
  if (!e.sector) return e;
  const usesFeedback = sectorDoesFeedback(e.sector);
  return usesFeedback === Boolean(e.sector.usesFeedback) ? e : { ...e, sector: { ...e.sector, usesFeedback } };
}
