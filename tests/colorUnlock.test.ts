import { describe, it, expect } from 'vitest';
import { colorUnlocked, awaitsSecondEvaluation, nextEvaluationPeriod, type ColorUnlockInput } from '../src/lib/colorUnlock';
import { faseDo } from '../src/lib/employeeGroups';

const base = (over: Partial<ColorUnlockInput> = {}): ColorUnlockInput => ({
  status: 'HIRED', isApprentice: false, currentColor: null, usesColorCycle: true, evaluations: [], ...over,
});

describe('cor liberada só depois da 2ª avaliação de experiência', () => {
  it('em experiência, antes da 2ª avaliação: bloqueada', () => {
    expect(colorUnlocked(base({ status: 'AWAITING_PERIOD_1' }))).toBe(false);
    expect(colorUnlocked(base({ status: 'AWAITING_PERIOD_2', evaluations: [{ period: 'FIRST' }] }))).toBe(false);
  });

  it('com a 2ª avaliação registrada: liberada', () => {
    expect(colorUnlocked(base({ evaluations: [{ period: 'FIRST' }, { period: 'SECOND' }] }))).toBe(true);
  });

  it('quem já tem cor ou feedback não perde a cor com a regra nova', () => {
    expect(colorUnlocked(base({ currentColor: 'VERDE' }))).toBe(true);
    expect(colorUnlocked(base({ evaluations: [{ period: 'FEEDBACK' }] }))).toBe(true);
  });

  it('é individual: depende só do histórico de cada um', () => {
    const a = base({ evaluations: [{ period: 'SECOND' }] });
    const b = base({ evaluations: [{ period: 'FIRST' }] });
    expect([colorUnlocked(a), colorUnlocked(b)]).toEqual([true, false]);
  });
});

describe('efetivado na 1ª avaliação num setor de cores ainda faz a 2ª', () => {
  const efetivadoNa1 = base({ evaluations: [{ period: 'FIRST' }] });

  it('a 2ª avaliação continua devida e é a próxima', () => {
    expect(awaitsSecondEvaluation(efetivadoNa1)).toBe(true);
    expect(nextEvaluationPeriod(efetivadoNa1)).toBe('SECOND');
  });

  it('fora do projeto de cores, segue como antes (sem 2ª avaliação)', () => {
    expect(awaitsSecondEvaluation({ ...efetivadoNa1, usesColorCycle: false })).toBe(false);
  });

  it('aprendiz e desligado não têm próxima avaliação', () => {
    expect(nextEvaluationPeriod({ ...efetivadoNa1, isApprentice: true })).toBeNull();
    expect(nextEvaluationPeriod({ ...efetivadoNa1, status: 'TERMINATED' })).toBeNull();
  });

  it('depois da 2ª avaliação, entra no ciclo de feedback', () => {
    expect(nextEvaluationPeriod(base({ evaluations: [{ period: 'FIRST' }, { period: 'SECOND' }] }))).toBe('FEEDBACK');
  });

  it('o acompanhamento do RH lista entre os pendentes da 2ª avaliação', () => {
    expect(faseDo({ status: 'HIRED', currentColor: null, sector: { usesColorCycle: true }, evaluations: [{ period: 'FIRST' }] })).toBe('PENDENTE_2');
    expect(faseDo({ status: 'HIRED', currentColor: null, sector: { usesColorCycle: true }, evaluations: [{ period: 'SECOND' }] })).toBe('ARQUIVADO');
    // Sem o histórico na mão, mantém o comportamento antigo.
    expect(faseDo({ status: 'HIRED' })).toBe('ARQUIVADO');
  });
});
