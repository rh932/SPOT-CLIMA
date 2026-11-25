/**
 * Regra de escopo do portal do gestor, num lugar só.
 *
 * Um gestor (GESTOR ou GESTOR_LIDER) só enxerga funcionários que batem nas
 * TRÊS dimensões do escopo dele: unidade (uma das suas), setor (um dos seus)
 * e turno (um dos seus). A regra estava repetida à mão em três rotas com
 * formas diferentes — aqui ela é única, pura e testável.
 *
 * Quem pode AVALIAR é outra coisa: ver `canEvaluate` abaixo. O GESTOR_LIDER
 * é o PJ que cuida de um único setor: acompanha, cobra e também avalia a
 * própria equipe.
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

/**
 * Gerentes (GERENTE, GERENTE_AVALIADOR, GERENTE_TREINADOR) cuidam do salão
 * inteiro: enxergam o turno do dia E o da noite, seja qual for o turno
 * marcado na conta (decisão do RH em 25/11/2026). Os demais perfis seguem o
 * turno cadastrado. Aplicada na leitura, para valer também para as contas
 * que já existem, sem mexer no banco.
 */
export function turnosEfetivos(role: string, turnos: string[]): string[] {
  return role === 'GERENTE' || role === 'GERENTE_AVALIADOR' || role === 'GERENTE_TREINADOR'
    ? ['DIA', 'NOITE']
    : turnos;
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

/**
 * Quem avalia: o GESTOR, o PJ, o GESTOR_LIDER (o PJ que cuida de um único
 * setor, decisão do RH em 23/11/2026) e os Gerentes que avaliam (GERENTE e
 * GERENTE_AVALIADOR). Super Admin, RH e Treinador não avaliam pelo portal.
 */
export function canEvaluate(role: string): boolean {
  return role === 'GESTOR' || role === 'GESTOR_LIDER' || role === 'GERENTE' || role === 'GERENTE_AVALIADOR' || role === 'PJ';
}

/**
 * O TREINADOR usa exatamente o mesmo recorte do gestor: unidade + setor +
 * turno. Hoje o treinamento atende só os setores de Salão, mas isso é
 * configuração (o ADM marca os setores na conta), não regra no código — no dia
 * em que entrar Cozinha, é só marcar a caixa.
 */
export type TreinadorScope = GestorScope;
