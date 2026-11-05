import { describe, it, expect } from 'vitest';
import { resumoFeedback, jaRecebeuFeedback } from '../src/lib/feedbackResumo';
import { usesFeedbackCycle, withFeedbackCycle } from '../src/lib/feedbackParticipation';
import { colorUnlocked, awaitsSecondEvaluation, nextEvaluationPeriod } from '../src/lib/colorUnlock';
import { cycleFieldsFor } from '../src/lib/employeeCreate';

const now = new Date(2026, 10, 15, 10, 0, 0);

describe('resumoFeedback', () => {
  it('conta vencidos, nunca receberam e feedbacks do mês', () => {
    const r = resumoFeedback([
      { nextFeedbackDueDate: new Date(2026, 10, 15).toISOString(), evaluations: [] },
      {
        nextFeedbackDueDate: new Date(2027, 0, 10).toISOString(),
        evaluations: [{ period: 'FEEDBACK', evaluationDate: new Date(2026, 10, 3).toISOString() }],
      },
      {
        nextFeedbackDueDate: new Date(2026, 9, 1).toISOString(),
        evaluations: [
          { period: 'FEEDBACK', evaluationDate: new Date(2026, 8, 3).toISOString() },
          { period: 'SECOND', evaluationDate: new Date(2026, 10, 2).toISOString() },
        ],
      },
    ], now);
    expect(r).toEqual({ total: 3, vencidos: 2, nuncaReceberam: 1, noMes: 1 });
  });

  it('avaliação de experiência não conta como feedback', () => {
    expect(jaRecebeuFeedback({ nextFeedbackDueDate: null, evaluations: [{ period: 'SECOND', evaluationDate: '2026-01-01' }] })).toBe(false);
  });
});

describe('participação no feedback', () => {
  it('ATIVO participa em qualquer setor; NOVO segue a chave do setor', () => {
    expect(usesFeedbackCycle(false, 'ATIVO')).toBe(true);
    expect(usesFeedbackCycle(false, 'NOVO')).toBe(false);
    expect(usesFeedbackCycle(true, 'NOVO')).toBe(true);
  });

  it('withFeedbackCycle liga a chave só para ATIVO e não muda o original', () => {
    const sector = { name: 'Cozinha', usesColorCycle: false };
    const ativo = withFeedbackCycle({ track: 'ATIVO' as const, sector });
    expect(ativo.sector.usesColorCycle).toBe(true);
    expect(sector.usesColorCycle).toBe(false);
    expect(withFeedbackCycle({ track: 'NOVO' as const, sector }).sector.usesColorCycle).toBe(false);
  });
});

describe('ATIVO no ciclo', () => {
  const ativo = { status: 'HIRED' as const, isApprentice: false, currentColor: null, usesColorCycle: true, track: 'ATIVO' as const, evaluations: [] };

  it('não deve a 2ª avaliação de experiência e vai direto para o feedback', () => {
    expect(colorUnlocked(ativo)).toBe(true);
    expect(awaitsSecondEvaluation(ativo)).toBe(false);
    expect(nextEvaluationPeriod(ativo)).toBe('FEEDBACK');
  });

  it('um NOVO efetivado sem a 2ª ainda a deve', () => {
    expect(nextEvaluationPeriod({ ...ativo, track: 'NOVO' })).toBe('SECOND');
  });

  it('ATIVO nasce com o 1º feedback vencendo hoje', () => {
    const f = cycleFieldsFor('ATIVO', new Date('2023-01-10T12:00:00Z'), false, now);
    expect((f as { nextFeedbackDueDate?: Date }).nextFeedbackDueDate).toBe(now);
    expect('nextFeedbackDueDate' in cycleFieldsFor('NOVO', now)).toBe(false);
  });
});
