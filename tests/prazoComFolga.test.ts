import { describe, expect, it } from 'vitest';
import { EVALUATION_BUFFER_DAYS, evaluatorDueDate, dueBadge } from '../src/lib/probation';
import { evaluationDailyMessage } from '../src/lib/feedbackCycle';
import { notificationPayload } from '../src/lib/pushPayload';

describe('prazo do gestor tem folga de 2 dias', () => {
  it('contrato vence em 6 dias, para quem avalia vence em 4', () => {
    const agora = new Date('2026-11-26T15:00:00Z');
    const contrato = new Date('2026-12-02T12:00:00Z');
    expect(EVALUATION_BUFFER_DAYS).toBe(2);
    expect(dueBadge(contrato, agora)?.label).toBe('Vence em 6d');
    expect(dueBadge(evaluatorDueDate(contrato), agora)?.label).toBe('Vence em 4d');
  });
  it('no último dia do contrato o gestor já está atrasado há 2 dias', () => {
    const agora = new Date('2026-12-02T15:00:00Z');
    expect(dueBadge(evaluatorDueDate(new Date('2026-12-02T12:00:00Z')), agora)?.label).toBe('Atrasado (2d)');
  });
});

describe('aviso diário da avaliação de experiência', () => {
  it('conta o prazo do gestor e diz quando o contrato vence de fato', () => {
    expect(evaluationDailyMessage('Ana', 4, 'de 90 dias')).toContain('Faltam 4 dias');
    expect(evaluationDailyMessage('Ana', 1, 'de 90 dias')).toContain('Amanhã é o último dia');
    expect(evaluationDailyMessage('Ana', 0, 'de 90 dias')).toContain('O contrato vence em 2 dias');
    expect(evaluationDailyMessage('Ana', -1, 'de 90 dias')).toContain('ATRASADA há 1 dia');
    expect(evaluationDailyMessage('Ana', -1, 'de 90 dias')).toContain('O contrato vence amanhã');
    expect(evaluationDailyMessage('Ana', -2, 'de 45 dias')).toContain('O contrato vence HOJE');
    expect(evaluationDailyMessage('Ana', -3, 'de 45 dias')).toContain('O contrato já venceu');
  });
  it('o push da avaliação é de prioridade; o de feedback não', () => {
    const av = notificationPayload({ type: 'EVALUATION_REMINDER', employeeId: 'e1', message: 'x', portal: 'gestor', offsetDays: 2 });
    const fb = notificationPayload({ type: 'FEEDBACK_REMINDER', employeeId: 'e1', message: 'x', portal: 'gestor', offsetDays: 2 });
    expect(av.urgent).toBe(true);
    expect(fb.urgent).toBeUndefined();
  });
});
