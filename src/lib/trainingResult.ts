/**
 * Rótulo do resultado de um treinamento.
 *
 * Regra do RH (28/10/2026): o treinamento é registrado nos últimos 3 dias, e o
 * encerramento definitivo diz se o colaborador está APTO ou NÃO APTO. As
 * fichas do dia continuam com Aprovado / Aprovado com ressalva / Reprovado.
 *
 * O banco segue com o mesmo enum: no definitivo, APROVADO é "Apto" e
 * REPROVADO é "Não apto". Encerramentos antigos com ressalva aparecem como
 * "Apto com ressalva" para não esconder o que foi registrado.
 */

export type TrainingResult = 'APROVADO' | 'APROVADO_COM_RESSALVA' | 'REPROVADO';
export type TrainingClosure = 'DIA' | 'DEFINITIVO';

const DIA_LABEL: Record<TrainingResult, string> = {
  APROVADO: 'Aprovado',
  APROVADO_COM_RESSALVA: 'Aprovado com ressalva',
  REPROVADO: 'Reprovado',
};

const DEFINITIVO_LABEL: Record<TrainingResult, string> = {
  APROVADO: 'Apto',
  APROVADO_COM_RESSALVA: 'Apto com ressalva',
  REPROVADO: 'Não apto',
};

/** Opções da ficha do dia. */
export const DAILY_RESULT_OPTIONS = (Object.keys(DIA_LABEL) as TrainingResult[])
  .map((value) => ({ value, label: DIA_LABEL[value] }));

/** Opções do encerramento definitivo. */
export const FINAL_RESULT_OPTIONS: { value: TrainingResult; label: string }[] = [
  { value: 'APROVADO', label: 'Apto' },
  { value: 'REPROVADO', label: 'Não apto' },
];

export function trainingResultLabel(result: string, closure?: TrainingClosure | null): string {
  const mapa = closure === 'DEFINITIVO' ? DEFINITIVO_LABEL : DIA_LABEL;
  return mapa[result as TrainingResult] ?? result;
}
