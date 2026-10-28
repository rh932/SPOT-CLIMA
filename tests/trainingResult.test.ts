import { describe, it, expect } from 'vitest';
import { trainingResultLabel } from '@/lib/trainingResult';
import { trainingSchema } from '@/lib/validation';

describe('resultado do treinamento', () => {
  it('ficha do dia mantém Aprovado / com ressalva / Reprovado', () => {
    expect(trainingResultLabel('APROVADO', 'DIA')).toBe('Aprovado');
    expect(trainingResultLabel('APROVADO_COM_RESSALVA')).toBe('Aprovado com ressalva');
    expect(trainingResultLabel('REPROVADO', 'DIA')).toBe('Reprovado');
  });

  it('encerramento definitivo vira Apto / Não apto', () => {
    expect(trainingResultLabel('APROVADO', 'DEFINITIVO')).toBe('Apto');
    expect(trainingResultLabel('REPROVADO', 'DEFINITIVO')).toBe('Não apto');
    expect(trainingResultLabel('APROVADO_COM_RESSALVA', 'DEFINITIVO')).toBe('Apto com ressalva');
  });

  const base = { employeeId: 'e1', trainingTypeId: 't1', needsReinforcement: false };

  it('a rota recusa "com ressalva" no definitivo', () => {
    expect(trainingSchema.safeParse({ ...base, result: 'APROVADO_COM_RESSALVA', closure: 'DEFINITIVO' }).success).toBe(false);
    expect(trainingSchema.safeParse({ ...base, result: 'REPROVADO', closure: 'DEFINITIVO' }).success).toBe(true);
    expect(trainingSchema.safeParse({ ...base, result: 'APROVADO_COM_RESSALVA', closure: 'DIA' }).success).toBe(true);
  });
});
