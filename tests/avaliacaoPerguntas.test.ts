import { describe, it, expect } from 'vitest';
import { EVALUATION_DIMENSIONS, SUB_ANSWER_LABELS, opcoesPermitidas } from '../src/data/evaluationBank';
import { evaluationSubmissionSchema } from '../src/lib/validation';

const interesse = EVALUATION_DIMENSIONS.find((d) => d.key === 'interest')!;

const sub = (dim: (typeof EVALUATION_DIMENSIONS)[number]['key']) =>
  Object.fromEntries(EVALUATION_DIMENSIONS.find((d) => d.key === dim)!.subQuestions.map((q) => [q.key, q.options[0]]));

const base = {
  evaluationDate: new Date().toISOString(),
  dueDateAtEvaluation: new Date().toISOString(),
  flexibilityRating: 'BOM', flexibilitySubAnswers: sub('flexibility'),
  interestRating: 'BOM', interestSubAnswers: sub('interest'),
  relationshipRating: 'BOM', relationshipSubAnswers: sub('relationship'),
  learningRating: 'BOM', learningSubAnswers: sub('learning'),
  favorableAspects: 'ok ok', unfavorableAspects: 'ok ok', classification: 'OTIMAS_PERSPECTIVAS',
};

describe('pergunta de Interesse e Compromisso', () => {
  const q = interesse.subQuestions[2];

  it('tem o texto novo e as quatro opções pedidas', () => {
    expect(q.text).toBe('Perde o estímulo com facilidade? Faz-se necessário oferecer doses constantes de motivação?');
    expect(q.options).toEqual(['SIM', 'NAO', 'MEDIO', 'AS_VEZES']);
    expect(q.options.map((o) => SUB_ANSWER_LABELS[o])).toEqual(['Sim', 'Não', 'Médio', 'Às vezes']);
  });

  it('guarda a pergunta antiga à parte, para respostas antigas não serem lidas ao contrário', () => {
    expect(q.key).not.toBe('q3');
    expect(q.legacy?.key).toBe('q3');
    expect(q.legacy?.text).toContain('Não perde o estímulo');
    expect(q.legacy?.options).toEqual(['SIM', 'NAO']);
  });
});

describe('Médio e Às vezes não foram espalhados pelas outras perguntas', () => {
  it('só a pergunta de estímulo oferece Médio e Às vezes', () => {
    const comMedio = EVALUATION_DIMENSIONS.flatMap((d) =>
      d.subQuestions.filter((q) => q.options.includes('MEDIO') || q.options.includes('AS_VEZES')).map((q) => `${d.key}.${q.key}`));
    expect(comMedio).toEqual(['interest.q3_v2']);
  });

  it('as perguntas que já tinham escala própria mantêm as opções (Talvez e Regular)', () => {
    expect(opcoesPermitidas('flexibility', 'q1')).toEqual(['SIM', 'NAO', 'TALVEZ']);
    expect(opcoesPermitidas('learning', 'q1')).toEqual(['SIM', 'NAO', 'REGULAR']);
    expect(opcoesPermitidas('relationship', 'q1')).toEqual(['SIM', 'NAO']);
  });
});

describe('validação das respostas por pergunta', () => {
  it('aceita Médio e Às vezes na pergunta de estímulo', () => {
    for (const r of ['MEDIO', 'AS_VEZES', 'SIM', 'NAO']) {
      const body = { ...base, interestSubAnswers: { ...sub('interest'), q3_v2: r } };
      expect(evaluationSubmissionSchema.safeParse(body).success).toBe(true);
    }
  });

  it('recusa Médio onde a pergunta é só Sim/Não', () => {
    const body = { ...base, relationshipSubAnswers: { q1: 'MEDIO', q2: 'SIM' } };
    expect(evaluationSubmissionSchema.safeParse(body).success).toBe(false);
  });

  it('recusa a chave antiga (q3) em avaliação nova', () => {
    const body = { ...base, interestSubAnswers: { q1: 'SIM', q2: 'SIM', q3: 'SIM' } };
    expect(evaluationSubmissionSchema.safeParse(body).success).toBe(false);
  });
});
