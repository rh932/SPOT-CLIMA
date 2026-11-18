import { describe, it, expect } from 'vitest';
import {
  buildEmployeeTimeline,
  evaluationTitle,
  type TimelineEvaluation,
  type TimelineColorChange,
  type TimelineTraining,
} from '../src/lib/employeeTimeline';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const avaliacao = (over: Partial<TimelineEvaluation> = {}): TimelineEvaluation => ({
  id: 'e1',
  period: 'FIRST',
  cycleNumber: 1,
  evaluationDate: at(2026, 2, 15),
  classification: 'OTIMAS_PERSPECTIVAS',
  conclusion: null,
  color: null,
  evaluator: { name: 'Ana' },
  ...over,
});

const mudancaCor = (over: Partial<TimelineColorChange> = {}): TimelineColorChange => ({
  id: 'c1',
  createdAt: at(2026, 5, 20),
  previousColor: 'VERMELHO',
  newColor: 'VERDE',
  reason: 'Evoluiu muito no atendimento.',
  evaluationId: null,
  changedBy: { name: 'Bruno' },
  ...over,
});

const treinamento = (over: Partial<TimelineTraining> = {}): TimelineTraining => ({
  id: 't1',
  trainingDate: at(2026, 3, 10),
  result: 'APROVADO',
  closure: 'DIA',
  needsReinforcement: false,
  trainingType: { name: 'Novos Colaboradores' },
  trainer: { name: 'Carla' },
  ...over,
});

describe('evaluationTitle', () => {
  it('nomeia os três casos', () => {
    expect(evaluationTitle('FIRST', 1)).toBe('Primeiro prazo de experiência (45 dias)');
    expect(evaluationTitle('SECOND', 1)).toBe('Segundo prazo de experiência (mais 45 dias)');
    expect(evaluationTitle('FEEDBACK', 3)).toBe('Terceiro feedback');
  });
});

describe('buildEmployeeTimeline', () => {
  it('sempre inclui a admissão', () => {
    const t = buildEmployeeTimeline({ admissionDate: at(2026, 1, 2) });
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('ADMISSAO');
    expect(t[0].date).toEqual(at(2026, 1, 2));
  });

  it('ordena em ordem cronológica, da admissão em diante', () => {
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      evaluations: [avaliacao()],
      colorChanges: [mudancaCor()],
      trainings: [treinamento()],
    });
    expect(t.map((e) => e.kind)).toEqual(['ADMISSAO', 'EXPERIENCIA', 'TREINAMENTO', 'COR']);
  });

  // A cor definida na avaliação já aparece na linha da avaliação.
  it('não duplica a mudança de cor nascida de uma avaliação', () => {
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      evaluations: [avaliacao({ period: 'SECOND', conclusion: 'EFETIVAR', color: 'AMARELO' })],
      colorChanges: [mudancaCor({ evaluationId: 'e1' })],
    });
    expect(t.filter((e) => e.kind === 'COR')).toHaveLength(0);
    const ev = t.find((e) => e.kind === 'EXPERIENCIA')!;
    expect(ev.detail).toContain('Efetivar');
    expect(ev.detail).toContain('Classificado como Amarelo');
    expect(ev.color).toBe('AMARELO');
  });

  it('descreve a mudança de cor avulsa com autor e motivo', () => {
    const evento = buildEmployeeTimeline({ admissionDate: at(2026, 1, 2), colorChanges: [mudancaCor()] }).find((e) => e.kind === 'COR')!;
    expect(evento.title).toBe('Cor alterada: Vermelho → Verde');
    expect(evento.author).toBe('Bruno');
    expect(evento.detail).toBe('Evoluiu muito no atendimento.');
  });

  it('trata a primeira classificação sem cor anterior', () => {
    const evento = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      colorChanges: [mudancaCor({ previousColor: null, newColor: 'VERMELHO' })],
    }).find((e) => e.kind === 'COR')!;
    expect(evento.title).toBe('Classificado como Vermelho');
  });

  it('marca o treinamento encerrado em definitivo e o reforço', () => {
    const evento = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      trainings: [treinamento({ closure: 'DEFINITIVO', needsReinforcement: true, result: 'APROVADO_COM_RESSALVA' })],
    }).find((e) => e.kind === 'TREINAMENTO')!;
    expect(evento.detail).toBe('Apto com ressalva · Precisa de reforço · Encerrado em definitivo');
    expect(evento.author).toBe('Carla');
  });

  it('aceita datas em texto, como vêm da API', () => {
    const t = buildEmployeeTimeline({
      admissionDate: '2026-01-02T00:00:00.000Z',
      evaluations: [avaliacao({ evaluationDate: '2026-02-15T00:00:00.000Z' })],
    });
    expect(t[0].kind).toBe('ADMISSAO');
    expect(t[1].kind).toBe('EXPERIENCIA');
  });

  it('mantém ordem estável quando dois eventos caem no mesmo instante', () => {
    const mesmoDia = at(2026, 4, 1);
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      evaluations: [avaliacao({ evaluationDate: mesmoDia })],
      trainings: [treinamento({ trainingDate: mesmoDia })],
    });
    expect(t.slice(1, 3).map((e) => e.kind)).toEqual(['EXPERIENCIA', 'TREINAMENTO']);
  });
});

describe('linha do tempo da jornada: experiência x feedback', () => {
  const feedback = (n: number, dia: number, over: Partial<TimelineEvaluation> = {}): TimelineEvaluation => ({
    id: 'f' + n, period: 'FEEDBACK', cycleNumber: n, evaluationDate: at(2027, 1, dia),
    classification: 'OTIMAS_PERSPECTIVAS', conclusion: null, color: 'VERMELHO',
    nextDueDate: at(2027, 2, dia), evaluator: { name: 'Ana' }, ...over,
  });

  it('separa os dois prazos de experiência dos feedbacks e nunca usa o nome de admissão', () => {
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 6, 1),
      period1DueDate: at(2026, 7, 15),
      period2DueDate: at(2026, 8, 29),
      evaluations: [
        avaliacao({ id: 'p1', period: 'FIRST', evaluationDate: at(2026, 7, 14), conclusion: 'EXTENDER' }),
        avaliacao({ id: 'p2', period: 'SECOND', evaluationDate: at(2026, 8, 28), conclusion: 'EFETIVAR' }),
        feedback(1, 10),
        feedback(2, 20, { color: 'AMARELO' }),
      ],
    });
    expect(t.map((e) => e.title)).toEqual([
      'Admissão',
      'Primeiro prazo de experiência (45 dias)',
      'Segundo prazo de experiência (mais 45 dias)',
      'Primeiro feedback',
      'Segundo feedback',
    ]);
    expect(t.map((e) => e.kind)).toEqual(['ADMISSAO', 'EXPERIENCIA', 'EXPERIENCIA', 'FEEDBACK', 'FEEDBACK']);
    expect(t.filter((e) => e.kind === 'FEEDBACK').every((e) => !e.title.toLowerCase().includes('admiss'))).toBe(true);
  });

  it('traz a próxima data prevista: 1º prazo na admissão, 2º prazo na extensão e a data da cor no feedback', () => {
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 6, 1),
      period1DueDate: at(2026, 7, 15),
      period2DueDate: at(2026, 8, 29),
      evaluations: [avaliacao({ id: 'p1', period: 'FIRST', evaluationDate: at(2026, 7, 14), conclusion: 'EXTENDER' }), feedback(1, 10)],
    });
    expect(t[0].nextDate).toEqual(at(2026, 7, 15));
    expect(t[1].nextDate).toEqual(at(2026, 8, 29));
    expect(t[2].nextDate).toEqual(at(2027, 2, 10));
  });

  it('cada feedback guarda responsável, classificação e o atalho para o registro', () => {
    const [, f] = buildEmployeeTimeline({ admissionDate: at(2026, 6, 1), evaluations: [feedback(1, 10)] });
    expect(f.author).toBe('Ana');
    expect(f.color).toBe('VERMELHO');
    expect(f.evaluationId).toBe('f1');
    expect(f.detail).toContain('Classificado como Vermelho');
  });

  it('mantém a classificação de cada momento no histórico (cenário D)', () => {
    const cores = ['VERMELHO', 'AMARELO', 'VERDE', 'AMARELO'] as const;
    const quatro = cores.map((c, i) => feedback(i + 1, (i + 1) * 5, { color: c }));
    const t = buildEmployeeTimeline({ admissionDate: at(2026, 6, 1), evaluations: quatro });
    const feedbacks = t.filter((e) => e.kind === 'FEEDBACK');
    expect(feedbacks.map((e) => e.title)).toEqual(['Primeiro feedback', 'Segundo feedback', 'Terceiro feedback', 'Quarto feedback']);
    expect(feedbacks.map((e) => e.color)).toEqual([...cores]);
  });

  it('inclui o desligamento no fim da jornada, com o motivo', () => {
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      evaluations: [feedback(1, 10)],
      termination: { date: at(2027, 3, 1), reason: 'PEDIDO_DEMISSAO', notes: 'Mudou de cidade' },
    });
    const ultimo = t[t.length - 1];
    expect(ultimo.kind).toBe('DESLIGAMENTO');
    expect(ultimo.detail).toBe('Pedido de demissão · Mudou de cidade');
    expect(t.some((e) => e.kind === 'FEEDBACK')).toBe(true);
  });
});
