import { describe, it, expect } from 'vitest';
import { validateAnswers, likertValues, type QuestionForValidation } from '../src/lib/surveyAnswers';

const q = (id: string, type: string, extra: Partial<QuestionForValidation> = {}): QuestionForValidation => ({
  id, type, required: false, scaleMin: null, scaleMax: null, options: [], ...extra,
});

describe('validateAnswers — o que conta como resposta', () => {
  const perguntas = [
    q('lik', 'LIKERT', { required: true }),
    q('esc', 'SCALE', { scaleMin: 0, scaleMax: 10 }),
    q('sn', 'YES_NO'),
    q('uma', 'SINGLE_CHOICE', { options: [{ label: 'A' }, { label: 'B' }] }),
    q('varias', 'MULTIPLE_CHOICE', { options: [{ label: 'A' }, { label: 'B' }] }),
    q('txt', 'LONG_TEXT'),
  ];

  it('aceita um envio completo e normaliza texto e escolhas repetidas', () => {
    const { rows, missingRequired } = validateAnswers(perguntas, [
      { questionId: 'lik', numericValue: 4 },
      { questionId: 'esc', numericValue: 0 },
      { questionId: 'sn', choiceValues: ['Não'] },
      { questionId: 'uma', choiceValues: ['B'] },
      { questionId: 'varias', choiceValues: ['A', 'A', 'B'] },
      { questionId: 'txt', textValue: '  bom lugar  ' },
    ]);
    expect(missingRequired).toEqual([]);
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.questionId === 'varias')?.choiceValues).toEqual(['A', 'B']);
    expect(rows.find((r) => r.questionId === 'txt')?.textValue).toBe('bom lugar');
  });

  it('um envio só com valores inválidos não gera nenhuma resposta', () => {
    const { rows } = validateAnswers(perguntas, [
      { questionId: 'esc', numericValue: 11 },
      { questionId: 'sn', choiceValues: ['Talvez'] },
      { questionId: 'uma', choiceValues: ['A', 'B'] },
      { questionId: 'varias', choiceValues: ['Z'] },
      { questionId: 'txt', textValue: '   ' },
      { questionId: 'de-outra-pesquisa', numericValue: 5 },
    ]);
    expect(rows).toEqual([]);
  });

  it('obrigatória mandada com valor fora da faixa continua faltando', () => {
    const { rows, missingRequired } = validateAnswers(perguntas, [
      { questionId: 'lik', numericValue: 0 },
      { questionId: 'txt', textValue: 'comentário' },
    ]);
    expect(missingRequired).toEqual(['lik']);
    expect(rows.map((r) => r.questionId)).toEqual(['txt']);
  });

  it('repetir a mesma pergunta não multiplica o voto: só a primeira vale', () => {
    const { rows } = validateAnswers(perguntas, [
      { questionId: 'lik', numericValue: 1 },
      { questionId: 'lik', numericValue: 5 },
      { questionId: 'lik', numericValue: 5 },
    ]);
    expect(rows).toEqual([{ questionId: 'lik', numericValue: 1 }]);
  });

  it('a primeira ocorrência inválida bloqueia as repetições seguintes', () => {
    const { rows, missingRequired } = validateAnswers(perguntas, [
      { questionId: 'lik', numericValue: 9 },
      { questionId: 'lik', numericValue: 3 },
    ]);
    expect(rows).toEqual([]);
    expect(missingRequired).toEqual(['lik']);
  });

  it('escala sem faixa cadastrada não aceita nota', () => {
    const { rows } = validateAnswers([q('sem-faixa', 'SCALE')], [{ questionId: 'sem-faixa', numericValue: 3 }]);
    expect(rows).toEqual([]);
  });
});

describe('likertValues — o limite de anonimato conta pessoas que deram nota', () => {
  const tipos = new Map([
    ['lik1', { type: 'LIKERT' }],
    ['lik2', { type: 'LIKERT' }],
    ['txt', { type: 'LONG_TEXT' }],
    ['esc', { type: 'SCALE' }],
  ]);

  it('conta cada pessoa uma vez, mesmo com várias notas', () => {
    const answers = [
      { responseId: 'r1', questionId: 'lik1', numericValue: 5 },
      { responseId: 'r1', questionId: 'lik2', numericValue: 4 },
      { responseId: 'r2', questionId: 'lik1', numericValue: 2 },
    ];
    expect(likertValues(answers, tipos, new Set(['r1', 'r2']))).toEqual({ values: [5, 4, 2], respondents: 2 });
  });

  it('quem só comentou ou só respondeu escala não conta como proteção da média Likert', () => {
    // Setor com 5 envios, mas só r1 deu nota Likert: a média exibida seria a nota dele.
    const answers = [
      { responseId: 'r1', questionId: 'lik1', numericValue: 1 },
      { responseId: 'r2', questionId: 'txt', numericValue: null },
      { responseId: 'r3', questionId: 'txt', numericValue: null },
      { responseId: 'r4', questionId: 'esc', numericValue: 7 },
    ];
    const setor = new Set(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(likertValues(answers, tipos, setor)).toEqual({ values: [1], respondents: 1 });
  });

  it('ignora respostas de fora do recorte', () => {
    const answers = [
      { responseId: 'r1', questionId: 'lik1', numericValue: 3 },
      { responseId: 'outro-setor', questionId: 'lik1', numericValue: 5 },
    ];
    expect(likertValues(answers, tipos, new Set(['r1']))).toEqual({ values: [3], respondents: 1 });
  });
});
