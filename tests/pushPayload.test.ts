import { describe, it, expect } from 'vitest';
import {
  feedbackReminderPayload, notificationPayload, notificationTag, notificationTitle, notificationUrl,
} from '../src/lib/pushPayload';

describe('feedbackReminderPayload', () => {
  const base = {
    employeeId: 'abc123',
    employeeName: 'Heloisa Mendonça',
    message: 'Lembrete: a avaliação de feedback de Heloisa Mendonça está prevista para daqui a 3 dias.',
  };

  it('leva a mensagem do sino, sem inventar texto novo', () => {
    const p = feedbackReminderPayload({ ...base, portal: 'gestor' });
    expect(p.body).toBe(base.message);
    expect(p.title).toContain('Spot Integra');
  });

  it('aponta para a ficha do colaborador no portal certo', () => {
    expect(feedbackReminderPayload({ ...base, portal: 'gestor' }).url).toBe('/gestor/employees/abc123');
    expect(feedbackReminderPayload({ ...base, portal: 'admin' }).url).toBe('/admin/employees/abc123');
  });

  // Mesmo `tag` = a notificação nova substitui a anterior no celular. Sem
  // isso, os lembretes de 7, 3 e 1 dia empilhariam três avisos do mesmo
  // colaborador na tela.
  it('usa a mesma tag para todos os lembretes do mesmo colaborador', () => {
    const sete = feedbackReminderPayload({ ...base, message: '7 dias', portal: 'gestor' });
    const um = feedbackReminderPayload({ ...base, message: 'amanhã', portal: 'gestor' });
    expect(sete.tag).toBe(um.tag);
    expect(sete.tag).toBe('feedback-abc123');
  });

  it('separa a tag de colaboradores diferentes', () => {
    const a = feedbackReminderPayload({ ...base, portal: 'gestor' });
    const b = feedbackReminderPayload({ ...base, employeeId: 'xyz789', portal: 'gestor' });
    expect(a.tag).not.toBe(b.tag);
  });

  // O aviso aparece na tela bloqueada, à vista de quem estiver por perto.
  it('não leva nada além do que já aparece no sino', () => {
    const p = feedbackReminderPayload({ ...base, portal: 'gestor' });
    expect(Object.keys(p).sort()).toEqual(['body', 'tag', 'title', 'url']);
  });
});

describe('notificationPayload', () => {
  it('lembrete atrasado muda o título', () => {
    expect(notificationTitle('EVALUATION_REMINDER', 3)).toContain('a vencer');
    expect(notificationTitle('EVALUATION_REMINDER', -1)).toContain('atrasada');
    expect(notificationTitle('FEEDBACK_REMINDER', -7)).toContain('atrasado');
  });

  it('o toque abre a ficha no portal em que o aparelho foi inscrito', () => {
    expect(notificationUrl('EVALUATION_SUBMITTED', 'e1', 'gestor')).toBe('/gestor/employees/e1');
    expect(notificationUrl('EVALUATION_SUBMITTED', 'e1', 'admin')).toBe('/admin/employees/e1');
  });

  it('sem colaborador, leva para a tela do assunto', () => {
    expect(notificationUrl('TRAINING_TYPE_CREATED', null, 'gestor')).toBe('/gestor/treinamento');
    expect(notificationUrl('TRAINING_TYPE_CREATED', null, 'admin')).toBe('/admin/trainings');
    expect(notificationUrl('EMPLOYEE_REMOVED', null, 'admin')).toBe('/admin/employees');
    expect(notificationUrl('EMPLOYEE_REMOVED', null, 'gestor')).toBe('/gestor');
  });

  // Uma avaliação registrada não pode sumir do celular porque, logo depois,
  // alguém mexeu no cadastro da mesma pessoa.
  it('movimentações de tipos diferentes não se substituem', () => {
    expect(notificationTag('EVALUATION_SUBMITTED', 'e1')).not.toBe(notificationTag('EMPLOYEE_UPDATED', 'e1'));
    expect(notificationTag('EVALUATION_REMINDER', 'e1')).not.toBe(notificationTag('FEEDBACK_REMINDER', 'e1'));
  });

  it('mantém o formato do contrato com o service worker', () => {
    const p = notificationPayload({ type: 'TRAINING_CREATED', employeeId: 'e1', message: 'x', portal: 'gestor' });
    expect(Object.keys(p).sort()).toEqual(['body', 'tag', 'title', 'url']);
  });
});
