/**
 * Regras do cadastro de setores.
 *
 * O projeto de cores (feedback a cada 45/120/180 dias) nasceu no Salão, e a
 * regra do restaurante é: setor cujo nome começa com "Salão" já entra no
 * ciclo. Isso é só o VALOR PADRÃO — depois de criado, quem manda é a chave
 * `usesColorCycle` do cadastro, que o RH liga e desliga na tela de Setores.
 */

/**
 * Compara ignorando maiúsculas e acentos: "Salão - Bar", "salao 2" e
 * "SALÃO PAULISTA" caem todos na mesma regra. Sem normalizar, um cadastro
 * digitado sem acento ficaria de fora do ciclo sem ninguém entender por quê.
 */
export function isSalaoSectorName(name: string): boolean {
  const normalizado = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  // `salao` seguido de fim, espaço ou pontuação — "salgados" não entra.
  return /^salao($|[\s\-–—,./])/.test(normalizado);
}

/**
 * Valor de `usesColorCycle` para um setor sendo criado ou renomeado.
 * Uma escolha explícita de quem está cadastrando sempre vence a regra.
 */
export function defaultUsesColorCycle(name: string, explicito?: boolean): boolean {
  return explicito ?? isSalaoSectorName(name);
}

/**
 * Valor de `inTraining` para um setor sendo criado: o treinamento também é do
 * Salão. Mesma lógica de padrão — a chave do cadastro manda depois.
 */
export function defaultInTraining(name: string, explicito?: boolean): boolean {
  return explicito ?? isSalaoSectorName(name);
}
