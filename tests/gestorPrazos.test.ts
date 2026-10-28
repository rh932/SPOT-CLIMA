import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  isExperience, isFeedback, evaluationOpen, evaluationOverdue, feedbackDue, feedbackLate, isPendencia, prazoBadge,
  type GestorEmployee,
} from '@/app/gestor/useGestorEmployees';

const HOJE = new Date('2026-10-28T15:00:00Z');
const dia = (offset: number) => new Date(Date.UTC(2026, 9, 28 + offset, 12)).toISOString();

function emp(over: Partial<GestorEmployee>): GestorEmployee {
  return {
    id: 'x', fullName: 'Fulano', admissionDate: dia(-40), roleDescription: 'Garçom', shift: 'DIA',
    status: 'AWAITING_PERIOD_1', period1DueDate: dia(4), period2DueDate: dia(49),
    currentColor: null, nextFeedbackDueDate: null,
    sector: { name: 'Salão', usesColorCycle: true }, unit: { name: 'Paulista' }, evaluations: [],
    ...over,
  } as GestorEmployee;
}

const efetivado = (venceEm: number) => emp({
  status: 'HIRED', currentColor: 'AMARELO', nextFeedbackDueDate: dia(venceEm),
  evaluations: [{ period: 'SECOND' } as GestorEmployee['evaluations'][number]],
});

describe('prazos do painel do gestor', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
  afterEach(() => vi.useRealTimers());

  it('experiência: sobe 10 dias antes e vira pendência 5 dias depois', () => {
    expect(evaluationOpen(emp({ period1DueDate: dia(11) }))).toBe(false);
    expect(evaluationOpen(emp({ period1DueDate: dia(10) }))).toBe(true);
    expect(evaluationOverdue(emp({ period1DueDate: dia(6) }))).toBe(false);
    expect(evaluationOverdue(emp({ period1DueDate: dia(5) }))).toBe(true);
    expect(isPendencia(emp({ period1DueDate: dia(-2) }))).toBe(true);
  });

  it('efetivado com a última avaliação feita sai da experiência e vai para o feedback', () => {
    const e = efetivado(30);
    expect(isExperience(e)).toBe(false);
    expect(isFeedback(e)).toBe(true);
    expect(isPendencia(e)).toBe(false);
  });

  it('efetivado no 1º período ainda devendo a 2ª continua na experiência', () => {
    const e = emp({ status: 'HIRED', currentColor: null, evaluations: [{ period: 'FIRST' } as GestorEmployee['evaluations'][number]] });
    expect(isExperience(e)).toBe(true);
    expect(isFeedback(e)).toBe(false);
  });

  it('aprendiz e desligado não entram em nenhuma lista', () => {
    expect(isExperience(emp({ isApprentice: true }))).toBe(false);
    expect(isExperience(emp({ status: 'TERMINATED' }))).toBe(false);
  });

  it('feedback: entra em pendências no vencimento, com 15 dias de prazo', () => {
    expect(feedbackDue(efetivado(1))).toBe(false);
    expect(feedbackDue(efetivado(0))).toBe(true);
    expect(prazoBadge(efetivado(0))?.label).toBe('Prazo: 15d');
    expect(prazoBadge(efetivado(-15))?.label).toBe('Prazo termina hoje');
    expect(feedbackLate(efetivado(-15))).toBe(false);
    expect(feedbackLate(efetivado(-16))).toBe(true);
    expect(prazoBadge(efetivado(-16))?.label).toBe('Atrasado (1d)');
  });
});
