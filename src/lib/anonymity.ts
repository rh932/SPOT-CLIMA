/**
 * Regra central de proteção de anonimato.
 * Qualquer tela ou exportação que agrupe respostas por setor, por unidade
 * (ou por outro corte) DEVE passar por applyAnonymityRule antes de exibir
 * números. Nunca faça essa checagem "in-line" em outro lugar do código.
 */

export const DEFAULT_ANONYMITY_THRESHOLD = 5;

/**
 * Piso do limite, fixo no servidor. Quem lê os resultados (o RH) é quem
 * configura a pesquisa — se o limite pudesse descer a 1, o setor de uma
 * pessoa só mostraria a nota dela. A pesquisa pode pedir MAIS que o piso,
 * nunca menos; o banco tem um CHECK com o mesmo valor (migração 0017).
 */
export const MIN_ANONYMITY_THRESHOLD = 5;
export const MAX_ANONYMITY_THRESHOLD = 50;

/**
 * O limite que vale de fato. Pesquisas gravadas antes do piso (ou um valor
 * inválido vindo de qualquer caminho) nunca ficam abaixo dele.
 */
export function effectiveThreshold(configured: number | null | undefined): number {
  const n = typeof configured === 'number' && Number.isInteger(configured) ? configured : DEFAULT_ANONYMITY_THRESHOLD;
  return Math.min(MAX_ANONYMITY_THRESHOLD, Math.max(MIN_ANONYMITY_THRESHOLD, n));
}

/**
 * Resultados só depois de encerrar. Com a pesquisa aberta, consultar o painel
 * antes e depois de alguém responder isola a resposta daquela pessoa (ataque
 * por diferença) — e uma pesquisa encerrada não volta a abrir (a publicação só
 * aceita rascunho ou agendada), então o retrato final é o único que existe.
 */
export function resultsReleased(status: string): boolean {
  return status === 'CLOSED' || status === 'ARCHIVED';
}

export interface AnonymityGuardedResult<T> {
  visible: boolean;
  responseCount: number;
  threshold: number;
  data: T | null;
  hiddenReason: string | null;
}

/**
 * Aplica a regra de anonimato mínimo a um recorte de dados (ex.: resultado de um setor).
 * Se responseCount < threshold, os dados não são retornados — mesmo que o chamador os tenha calculado.
 */
export function applyAnonymityRule<T>(
  responseCount: number,
  data: T,
  threshold: number = DEFAULT_ANONYMITY_THRESHOLD
): AnonymityGuardedResult<T> {
  const visible = responseCount >= threshold;
  return {
    visible,
    responseCount,
    threshold,
    data: visible ? data : null,
    hiddenReason: visible
      ? null
      : 'Resultados ocultados para preservar o anonimato devido ao baixo número de respostas.',
  };
}

/**
 * Filtra uma lista de recortes (ex.: setores), removendo/ocultando qualquer
 * grupo abaixo do limite. Usado em tabelas comparativas e rankings.
 */
export function filterVisibleGroups<T extends { responseCount: number }>(
  groups: T[],
  threshold: number = DEFAULT_ANONYMITY_THRESHOLD
): T[] {
  return groups.filter((g) => g.responseCount >= threshold);
}

/**
 * Impede cruzamentos de filtros que resultariam em grupos pequenos demais
 * (ex.: setor + status de uma pergunta de múltipla escolha específica).
 * Recebe o tamanho do grupo resultante da combinação de filtros.
 */
export function isCombinedFilterSafe(
  combinedGroupSize: number,
  threshold: number = DEFAULT_ANONYMITY_THRESHOLD
): boolean {
  return combinedGroupSize >= threshold;
}
