/**
 * Avaliação do uniforme no feedback. Vale para os três grupos do Salão —
 * Atendimento, Bar e Gerência — que são os setores "Salão - ...". Nota única
 * (mesma escala da ficha: Ótimo/Bom/Regular/Ruim) e observação opcional, em
 * qualquer forma de feedback (ficha padrão ou roteiro PDI).
 */
export const UNIFORME_PERGUNTA = 'Como está a apresentação do uniforme (limpo, passado, completo, crachá e calçado adequados)?';

/** O setor do colaborador é um dos grupos do Salão (Atendimento, Bar, Gerência)? */
export function setorAvaliaUniforme(nomeDoSetor: string | null | undefined): boolean {
  const n = (nomeDoSetor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  return n === 'SALAO' || n.startsWith('SALAO ');
}
