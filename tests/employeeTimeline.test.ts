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
    expect(evaluationTitle('FIRST', 1)).toBe('Avaliação de 45 dias');
    expect(evaluationTitle('SECOND', 1)).toBe('Avaliação de 90 dias');
    expect(evaluationTitle('FEEDBACK', 3)).toBe('3º feedback');
  });
});

describe('buildEmployeeTimeline', () => {
  it('sempre inclui a admissão', () => {
    const t = buildEmployeeTimeline({ admissionDate: at(2026, 1, 2) });
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('ADMISSAO');
    expect(t[0].date).toEqual(at(2026, 1, 2));
  });

  it('ordena do mais recente para o mais antigo', () => {
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      evaluations: [avaliacao()],
      colorChanges: [mudancaCor()],
      trainings: [treinamento()],
    });
    expect(t.map((e) => e.kind)).toEqual(['COR', 'TREINAMENTO', 'AVALIACAO', 'ADMISSAO']);
  });

  // A cor definida na avaliação já aparece na linha da avaliação.
  it('não duplica a mudança de cor nascida de uma avaliação', () => {
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      evaluations: [avaliacao({ period: 'SECOND', conclusion: 'EFETIVAR', color: 'AMARELO' })],
      colorChanges: [mudancaCor({ evaluationId: 'e1' })],
    });
    expect(t.filter((e) => e.kind === 'COR')).toHaveLength(0);
    const ev = t.find((e) => e.kind === 'AVALIACAO')!;
    expect(ev.detail).toContain('Efetivar');
    expect(ev.detail).toContain('Classificado como Amarelo');
    expect(ev.color).toBe('AMARELO');
  });

  it('descreve a mudança de cor avulsa com autor e motivo', () => {
    const [evento] = buildEmployeeTimeline({ admissionDate: at(2026, 1, 2), colorChanges: [mudancaCor()] });
    expect(evento.title).toBe('Cor alterada: Vermelho → Verde');
    expect(evento.author).toBe('Bruno');
    expect(evento.detail).toBe('Evoluiu muito no atendimento.');
  });

  it('trata a primeira classificação sem cor anterior', () => {
    const [evento] = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      colorChanges: [mudancaCor({ previousColor: null, newColor: 'VERMELHO' })],
    });
    expect(evento.title).toBe('Classificado como Vermelho');
  });

  it('marca o treinamento encerrado em definitivo e o reforço', () => {
    const [evento] = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      trainings: [treinamento({ closure: 'DEFINITIVO', needsReinforcement: true, result: 'APROVADO_COM_RESSALVA' })],
    });
    expect(evento.detail).toBe('Apto com ressalva · Precisa de reforço · Encerrado em definitivo');
    expect(evento.author).toBe('Carla');
  });

  it('aceita datas em texto, como vêm da API', () => {
    const t = buildEmployeeTimeline({
      admissionDate: '2026-01-02T00:00:00.000Z',
      evaluations: [avaliacao({ evaluationDate: '2026-02-15T00:00:00.000Z' })],
    });
    expect(t[0].kind).toBe('AVALIACAO');
    expect(t[1].kind).toBe('ADMISSAO');
  });

  it('mantém ordem estável quando dois eventos caem no mesmo instante', () => {
    const mesmoDia = at(2026, 4, 1);
    const t = buildEmployeeTimeline({
      admissionDate: at(2026, 1, 2),
      evaluations: [avaliacao({ evaluationDate: mesmoDia })],
      trainings: [treinamento({ trainingDate: mesmoDia })],
    });
    expect(t.slice(0, 2).map((e) => e.kind)).toEqual(['AVALIACAO', 'TREINAMENTO']);
  });
});
