import { describe, it, expect } from 'vitest';
import { resumoFeedback, jaRecebeuFeedback } from '../src/lib/feedbackResumo';
import { usesFeedbackCycle, withFeedbackCycle, sectorDoesFeedback } from '../src/lib/feedbackParticipation';
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
  it('o setor decide: a trilha do colaborador não liga o ciclo de cores sozinha', () => {
    expect(usesFeedbackCycle(false, 'ATIVO')).toBe(false);
    expect(usesFeedbackCycle(false, 'NOVO')).toBe(false);
    expect(usesFeedbackCycle(true, 'NOVO')).toBe(true);
    expect(usesFeedbackCycle(true, 'ATIVO')).toBe(true);
  });

  it('feedback e cores são escolhas separadas, e cores implicam feedback', () => {
    expect(sectorDoesFeedback({ usesFeedback: true, usesColorCycle: false })).toBe(true);
    expect(sectorDoesFeedback({ usesFeedback: false, usesColorCycle: true })).toBe(true);
    expect(sectorDoesFeedback({ usesFeedback: false, usesColorCycle: false })).toBe(false);
    expect(sectorDoesFeedback(null)).toBe(false);
  });

  it('withFeedbackCycle consolida usesFeedback (cores implicam feedback) sem mudar o original', () => {
    const sector = { name: 'Salão', usesColorCycle: true, usesFeedback: false };
    const out = withFeedbackCycle({ track: 'NOVO' as const, sector });
    expect(out.sector.usesFeedback).toBe(true);
    expect(sector.usesFeedback).toBe(false);
    const cozinha = { name: 'Cozinha', usesColorCycle: false, usesFeedback: false };
    expect(withFeedbackCycle({ track: 'ATIVO' as const, sector: cozinha }).sector).toBe(cozinha);
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
