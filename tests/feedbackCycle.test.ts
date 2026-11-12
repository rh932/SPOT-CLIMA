import { describe, it, expect } from 'vitest';
import {
  COLOR_INTERVAL_DAYS,
  daysBetween,
  dueReminderOffset,
  feedbackStatus,
  feedbackStatusBadge,
  isFeedbackColor,
  nextFeedbackDate,
  reminderMessage,
  colorChangeBaseDate,
  colorChangePreview,
} from '../src/lib/feedbackCycle';

/** Datas locais para não depender do fuso da máquina que roda os testes. */
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);

describe('nextFeedbackDate', () => {
  it('vermelho agenda para 45 dias', () => {
    expect(nextFeedbackDate(at(2026, 1, 1), 'VERMELHO')).toEqual(at(2026, 2, 15));
  });

  it('amarelo agenda para 120 dias', () => {
    expect(nextFeedbackDate(at(2026, 1, 1), 'AMARELO')).toEqual(at(2026, 5, 1));
  });

  it('verde agenda para 180 dias', () => {
    expect(nextFeedbackDate(at(2026, 1, 1), 'VERDE')).toEqual(at(2026, 6, 30));
  });

  it('ignora a hora em que a avaliação foi salva', () => {
    const manha = nextFeedbackDate(at(2026, 3, 10, 8), 'VERMELHO');
    const noite = nextFeedbackDate(at(2026, 3, 10, 23), 'VERMELHO');
    expect(manha).toEqual(noite);
  });

  it('os intervalos são exatamente os da regra 45/120/180', () => {
    expect(COLOR_INTERVAL_DAYS).toEqual({ VERMELHO: 45, AMARELO: 120, VERDE: 180 });
  });
});

describe('mudança de cor recalcula o ciclo', () => {
  it('verde -> amarelo antecipa a próxima avaliação para 120 dias', () => {
    const feedback = at(2026, 1, 1);
    expect(nextFeedbackDate(feedback, 'VERDE')).toEqual(at(2026, 6, 30));
    expect(nextFeedbackDate(feedback, 'AMARELO')).toEqual(at(2026, 5, 1));
  });

  it('amarelo -> vermelho antecipa a próxima avaliação para 45 dias', () => {
    expect(nextFeedbackDate(at(2026, 1, 1), 'VERMELHO')).toEqual(at(2026, 2, 15));
  });
});

describe('daysBetween', () => {
  it('conta dias de calendário, não intervalos de 24h', () => {
    expect(daysBetween(at(2026, 1, 1, 23), at(2026, 1, 2, 1))).toBe(1);
  });

  it('é negativo quando a data já passou', () => {
    expect(daysBetween(at(2026, 1, 10), at(2026, 1, 3))).toBe(-7);
  });
});

describe('feedbackStatus', () => {
  const hoje = at(2026, 1, 10);

  it('sem ciclo aberto retorna null', () => {
    expect(feedbackStatus({ nextDueDate: null }, hoje)).toBeNull();
  });

  it('concluída tem prioridade sobre a data', () => {
    expect(feedbackStatus({ nextDueDate: at(2026, 1, 1), completed: true }, hoje)).toBe('CONCLUIDA');
  });

  it('data futura distante -> agendada', () => {
    expect(feedbackStatus({ nextDueDate: at(2026, 2, 20) }, hoje)).toBe('AGENDADA');
  });

  it('faltando 8 dias ainda é agendada', () => {
    expect(feedbackStatus({ nextDueDate: at(2026, 1, 18) }, hoje)).toBe('AGENDADA');
  });

  it('faltando 7 dias já é próxima', () => {
    expect(feedbackStatus({ nextDueDate: at(2026, 1, 17) }, hoje)).toBe('PROXIMA');
  });

  it('vence hoje -> aguardando avaliação', () => {
    expect(feedbackStatus({ nextDueDate: at(2026, 1, 10, 22) }, hoje)).toBe('AGUARDANDO');
  });

  it('data passada sem conclusão -> em atraso', () => {
    expect(feedbackStatus({ nextDueDate: at(2026, 1, 9) }, hoje)).toBe('EM_ATRASO');
  });

  it('o badge carrega rótulo e classe do status', () => {
    const badge = feedbackStatusBadge({ nextDueDate: at(2026, 1, 9) }, hoje);
    expect(badge?.status).toBe('EM_ATRASO');
    expect(badge?.label).toBe('Em atraso');
    // A classe deixou de ser pilula pastel ('bg-red-100 text-red-700') e virou
    // cor de texto medida; o que o teste garante e que atraso tem aparencia
    // PROPRIA, nao qual e o hexadecimal dela.
    expect(badge?.className).not.toBe(feedbackStatusBadge({ nextDueDate: at(2026, 3, 9) }, hoje)?.className);
    expect(badge?.className.length).toBeGreaterThan(0);
  });

  it('sem ciclo aberto não gera badge', () => {
    expect(feedbackStatusBadge({ nextDueDate: null }, hoje)).toBeNull();
  });
});

describe('dueReminderOffset', () => {
  const hoje = at(2026, 1, 10);

  it.each([
    [at(2026, 1, 17), 7],
    [at(2026, 1, 13), 3],
    [at(2026, 1, 11), 1],
    [at(2026, 1, 10), 0],
    [at(2026, 1, 9), -1],
    [at(2026, 1, 3), -7],
  ])('dispara aviso nas antecedências previstas e no atraso', (due, offset) => {
    expect(dueReminderOffset(due as Date, hoje)).toBe(offset);
  });

  it.each([
    [at(2026, 1, 18)],
    [at(2026, 1, 16)],
    [at(2026, 1, 14)],
    [at(2026, 1, 12)],
    [at(2026, 1, 8)],
    [at(2026, 1, 2)],
  ])('não dispara aviso nos demais dias', (due) => {
    expect(dueReminderOffset(due as Date, hoje)).toBeNull();
  });

  it('a hora do dia não muda o aviso', () => {
    expect(dueReminderOffset(at(2026, 1, 13, 23), at(2026, 1, 10, 1))).toBe(3);
  });
});

describe('reminderMessage', () => {
  it('usa o texto definido para cada antecedência', () => {
    expect(reminderMessage('João Silva', 7)).toContain('daqui a 7 dias');
    expect(reminderMessage('João Silva', 3)).toContain('daqui a 3 dias');
    expect(reminderMessage('João Silva', 1)).toContain('amanhã');
    expect(reminderMessage('João Silva', 1)).toContain('João Silva');
    expect(reminderMessage('João Silva', 0)).toContain('vence hoje');
    expect(reminderMessage('João Silva', -1)).toContain('venceu ontem');
    expect(reminderMessage('João Silva', -7)).toContain('Atrasada há 7 dias');
  });

  it('diz de qual avaliação se trata', () => {
    expect(reminderMessage('João Silva', 3)).toContain('avaliação de feedback de João Silva');
    expect(reminderMessage('João Silva', 3, 'de 45 dias')).toContain('avaliação de 45 dias de João Silva');
  });
});

describe('isFeedbackColor', () => {
  it('aceita só as três cores', () => {
    expect(isFeedbackColor('VERDE')).toBe(true);
    expect(isFeedbackColor('AZUL')).toBe(false);
    expect(isFeedbackColor(null)).toBe(false);
  });
});

describe('colorChangeBaseDate', () => {
  const hoje = at(2026, 6, 10);

  it('primeira classificação conta de hoje', () => {
    const base = colorChangeBaseDate({
      currentColor: null,
      lastEvaluationDate: at(2026, 1, 5),
      today: hoje,
    });
    expect(base).toEqual(hoje);
  });

  // Mudar a cor ajusta a cadência; não pode virar atalho para adiar um
  // feedback que já venceu.
  it('mudança de cor conta da última avaliação, não de hoje', () => {
    const base = colorChangeBaseDate({
      currentColor: 'VERMELHO',
      lastEvaluationDate: at(2026, 1, 5),
      today: hoje,
    });
    expect(base).toEqual(at(2026, 1, 5));
  });

  it('sem avaliação registrada, cai em hoje', () => {
    const base = colorChangeBaseDate({ currentColor: 'VERDE', lastEvaluationDate: null, today: hoje });
    expect(base).toEqual(hoje);
  });
});

describe('colorChangePreview', () => {
  const hoje = at(2026, 6, 10);

  it('adianta o prazo ao endurecer a cor (verde para vermelho)', () => {
    const p = colorChangePreview({
      newColor: 'VERMELHO',
      currentColor: 'VERDE',
      lastEvaluationDate: at(2026, 5, 1),
      currentDueDate: nextFeedbackDate(at(2026, 5, 1), 'VERDE'),
      today: hoje,
    });
    expect(p.nextDueDate).toEqual(nextFeedbackDate(at(2026, 5, 1), 'VERMELHO'));
    // 45 dias em vez de 180: o próximo feedback vem 135 dias antes.
    expect(p.shiftInDays).toBe(COLOR_INTERVAL_DAYS.VERMELHO - COLOR_INTERVAL_DAYS.VERDE);
  });

  it('adia o prazo ao afrouxar a cor (vermelho para verde)', () => {
    const p = colorChangePreview({
      newColor: 'VERDE',
      currentColor: 'VERMELHO',
      lastEvaluationDate: at(2026, 5, 1),
      currentDueDate: nextFeedbackDate(at(2026, 5, 1), 'VERMELHO'),
      today: hoje,
    });
    expect(p.shiftInDays).toBe(COLOR_INTERVAL_DAYS.VERDE - COLOR_INTERVAL_DAYS.VERMELHO);
  });

  it('informa quantos dias faltam a partir de hoje', () => {
    const p = colorChangePreview({
      newColor: 'VERMELHO',
      currentColor: null,
      lastEvaluationDate: null,
      currentDueDate: null,
      today: hoje,
    });
    expect(p.daysFromToday).toBe(COLOR_INTERVAL_DAYS.VERMELHO);
    expect(p.shiftInDays).toBeNull();
  });
});

describe('reminderMessage fora dos dias da rotina (botão "Lembrar gestores agora")', () => {
  it('mantém os textos da rotina e cobre qualquer distância até o prazo', () => {
    expect(reminderMessage('Ana', -7, 'de 45 dias')).toBe('Atrasada há 7 dias: a avaliação de 45 dias de Ana ainda não foi registrada.');
    expect(reminderMessage('Ana', -12, 'de 90 dias')).toBe('Atrasada há 12 dias: a avaliação de 90 dias de Ana ainda não foi registrada.');
    expect(reminderMessage('Ana', 5, 'de 45 dias')).toBe('Lembrete: a avaliação de 45 dias de Ana está prevista para daqui a 5 dias.');
    expect(reminderMessage('Ana', 0, 'de 45 dias')).toBe('Hoje é o dia: a avaliação de 45 dias de Ana vence hoje.');
  });
});
