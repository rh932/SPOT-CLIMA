import { describe, it, expect } from 'vitest';
import { computeSurveyResults, computeCommentAnalysis, type ResultsInput } from '../src/lib/results';

/**
 * Monta uma pesquisa com `people` pessoas. Cada pessoa: [setor, unidade, notas
 * por pergunta Likert]. Perguntas q1/q2 na dimensão D1, q3 na D2.
 */
function survey(
  people: { sector: string; unit: string | null; notes: Record<string, number>; comment?: string }[],
  overrides: Partial<ResultsInput['survey']> = {},
): ResultsInput {
  const responses = people.map((p, i) => ({
    id: `r${i}`,
    sectorId: p.sector,
    sectorName: p.sector,
    unitId: p.unit,
    unitName: p.unit,
  }));
  const answers = people.flatMap((p, i) => [
    ...Object.entries(p.notes).map(([questionId, v]) => ({ responseId: `r${i}`, questionId, numericValue: v })),
    ...(p.comment ? [{ responseId: `r${i}`, questionId: 'c1', numericValue: null, textValue: p.comment }] : []),
  ]);
  return {
    survey: { id: 's1', name: 'Clima', status: 'CLOSED', eligiblePopulation: 40, anonymityThreshold: 5, ...overrides },
    questions: [
      { id: 'q1', text: 'Q1', type: 'LIKERT', dimensionId: 'D1', dimensionName: 'Liderança' },
      { id: 'q2', text: 'Q2', type: 'LIKERT', dimensionId: 'D1', dimensionName: 'Liderança' },
      { id: 'q3', text: 'Q3', type: 'LIKERT', dimensionId: 'D2', dimensionName: 'Comunicação' },
      { id: 'c1', text: 'Comentário', type: 'LONG_TEXT', dimensionId: null, dimensionName: null },
    ],
    responses,
    answers,
  };
}

const person = (sector: string, unit: string | null, v = 4, extra: Record<string, number> = {}) => ({
  sector, unit, notes: { q1: v, q3: v, ...extra },
});

describe('computeSurveyResults — trava enquanto a pesquisa está aberta', () => {
  const people = Array.from({ length: 12 }, () => person('Salao', 'U1'));

  it.each(['OPEN', 'DRAFT', 'SCHEDULED'])('status %s: só participação, nenhum número', (status) => {
    const r = computeSurveyResults(survey(people, { status }));
    expect(r.locked).toBe('SURVEY_OPEN');
    expect(r.totalResponses).toBe(12);
    expect(r.climateIndex).toBe(0);
    expect(r.byDimension).toEqual([]);
    expect(r.bySector).toEqual([]);
    expect(r.heatmap).toEqual([]);
    expect(r.topStrengths).toEqual([]);
  });

  it('ataque por diferença: com a pesquisa aberta, a resposta nova não muda nada visível além da contagem', () => {
    const before = computeSurveyResults(survey(people, { status: 'OPEN' }));
    const after = computeSurveyResults(survey([...people, person('Salao', 'U1', 1)], { status: 'OPEN' }));
    const strip = (x: typeof before) => ({ ...x, totalResponses: 0, participationRate: 0, participationClassification: '' });
    expect(strip(after)).toEqual(strip(before));
  });

  it('comentários também ficam travados com a pesquisa aberta', () => {
    const c = computeCommentAnalysis(survey(people.map((p) => ({ ...p, comment: 'ótimo lugar' })), { status: 'OPEN' }));
    expect(c.locked).toBe('SURVEY_OPEN');
    expect(c.examples.elogios).toEqual([]);
    expect(c.wordCloud).toEqual([]);
  });
});

describe('computeSurveyResults — pesquisa inteira abaixo do limite', () => {
  it('4 pessoas: nada de índice geral, dimensão ou favorabilidade', () => {
    const r = computeSurveyResults(survey([1, 2, 3, 5].map((v) => person('Salao', 'U1', v))));
    expect(r.locked).toBe('BELOW_THRESHOLD');
    expect(r.climateIndex).toBe(0);
    expect(r.byDimension).toEqual([]);
    expect(r.favorability).toEqual({ favorable: 0, neutral: 0, unfavorable: 0 });
  });

  it('limite gravado como 1 pela pesquisa não vale: o piso do servidor segura', () => {
    const r = computeSurveyResults(survey([person('Salao', 'U1', 2)], { anonymityThreshold: 1 }));
    expect(r.locked).toBe('BELOW_THRESHOLD');
    expect(r.anonymityThreshold).toBe(5);
  });
});

describe('computeSurveyResults — grupos ocultos não vazam', () => {
  const people = [
    ...Array.from({ length: 10 }, () => person('Salao', 'U1', 4)),
    ...Array.from({ length: 6 }, () => person('Cozinha', 'U1', 3)),
    person('Delivery', 'U1', 1),
  ];
  const r = computeSurveyResults(survey(people));

  it('grupo oculto sai sem contagem e sem números', () => {
    const delivery = r.bySector.find((s) => s.sectorId === 'Delivery')!;
    expect(delivery.visible).toBe(false);
    expect(delivery.responseCount).toBeNull();
    expect(delivery.index).toBeNull();
  });

  it('supressão secundária: o total menos os setores visíveis cobre ao menos o limite de pessoas', () => {
    const visiblePeople = r.bySector.filter((s) => s.visible).reduce((acc, s) => acc + (s.responseCount ?? 0), 0);
    const hidden = r.totalResponses - visiblePeople;
    expect(hidden === 0 || hidden >= 5).toBe(true);
  });

  it('célula do mapa de calor de setor oculto também fica oculta', () => {
    for (const cell of r.heatmap.filter((c) => c.sectorId === 'Delivery' || c.sectorId === 'Cozinha')) {
      expect(cell.visible).toBe(false);
      expect(cell.index).toBeNull();
      expect(cell.responseCount).toBeNull();
    }
  });

  it('favorabilidade geral não carrega a contagem de notas', () => {
    expect(Object.keys(r.favorability).sort()).toEqual(['favorable', 'neutral', 'unfavorable']);
  });
});

describe('computeSurveyResults — pergunta respondida por poucos fica fora de tudo', () => {
  // 10 pessoas respondem q1 e q3; só 2 respondem a opcional q2 (nota 1).
  const people = Array.from({ length: 10 }, (_, i) =>
    person('Salao', 'U1', 5, i < 2 ? { q2: 1 } : {}),
  );
  const r = computeSurveyResults(survey(people));

  it('a dimensão não muda por causa das 2 notas da opcional (senão a diferença as revelaria)', () => {
    const lideranca = r.byDimension.find((d) => d.dimensionId === 'D1')!;
    expect(lideranca.average).toBe(5);
    expect(r.excludedQuestions).toBe(1);
  });

  it('a opcional não aparece no ranking de perguntas', () => {
    expect(r.topCritical.map((q) => q.questionId)).not.toContain('q2');
  });

  it('o índice geral também não inclui as 2 notas', () => {
    expect(r.climateIndex).toBe(100);
  });
});

describe('computeCommentAnalysis — conteúdo só com comentaristas suficientes', () => {
  it('2 comentaristas numa pesquisa de 10: nem texto, nem tema, nem classificação', () => {
    const people = Array.from({ length: 10 }, (_, i) => ({
      ...person('Salao', 'U1'),
      comment: i < 2 ? 'o gerente grita com a equipe, péssimo' : undefined,
    }));
    const c = computeCommentAnalysis(survey(people));
    expect(c.verbatimHidden).toBe(true);
    expect(c.byTheme).toEqual([]);
    expect(c.bySentiment).toEqual([]);
    expect(c.examples).toEqual({ elogios: [], reclamacoes: [], sugestoes: [] });
    expect(c.wordCloud).toEqual([]);
  });

  it('5 comentaristas: conteúdo liberado, em ordem alfabética (não na ordem de envio)', () => {
    const texts = ['zeta ótimo', 'beta ótimo', 'alfa ótimo', 'gama ótimo', 'delta ótimo'];
    const people = texts.map((t) => ({ ...person('Salao', 'U1'), comment: t }));
    const c = computeCommentAnalysis(survey(people));
    expect(c.verbatimHidden).toBe(false);
    const shown = [...c.examples.elogios, ...c.examples.reclamacoes, ...c.examples.sugestoes];
    expect(shown).toEqual([...shown].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
});
