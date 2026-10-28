/**
 * Regra de escopo do portal do gestor, num lugar só.
 *
 * Um gestor (GESTOR ou GESTOR_LIDER) só enxerga funcionários que batem nas
 * TRÊS dimensões do escopo dele: unidade (uma das suas), setor (um dos seus)
 * e turno (um dos seus). A regra estava repetida à mão em três rotas com
 * formas diferentes — aqui ela é única, pura e testável.
 *
 * Quem pode AVALIAR é outra coisa: só o GESTOR. O GESTOR_LIDER acompanha a
 * operação (normalmente vários setores e os dois turnos) para cobrar quem
 * está devendo avaliação, mas nunca preenche a avaliação no lugar do gestor.
 */

export interface GestorScope {
  scopedUnitIds: string[];
  scopedSectorIds: string[];
  scopedShifts: string[];
}

export interface ScopedEmployee {
  unitId: string;
  sectorId: string;
  shift: string;
}

/** O escopo está completo o suficiente para o painel funcionar? */
export function hasCompleteScope(scope: GestorScope): boolean {
  return scope.scopedUnitIds.length > 0
    && scope.scopedSectorIds.length > 0
    && scope.scopedShifts.length > 0;
}

export function isInScope(scope: GestorScope, employee: ScopedEmployee): boolean {
  return scope.scopedUnitIds.includes(employee.unitId)
    && scope.scopedSectorIds.includes(employee.sectorId)
    && scope.scopedShifts.includes(employee.shift);
}

/** Só o GESTOR e o GERENTE avaliam. O GESTOR_LIDER é somente-leitura no portal. */
export function canEvaluate(role: string): boolean {
  return role === 'GESTOR' || role === 'GERENTE';
}

/**
 * O TREINADOR usa exatamente o mesmo recorte do gestor: unidade + setor +
 * turno. Hoje o treinamento atende só os setores de Salão, mas isso é
 * configuração (o ADM marca os setores na conta), não regra no código — no dia
 * em que entrar Cozinha, é só marcar a caixa.
 */
export type TreinadorScope = GestorScope;
