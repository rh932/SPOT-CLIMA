import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));

const { classifyEnps, computeEnps, enpsCategory, enpsQuestionFields } = await import('@/lib/enps');
const { computeSurveyResults } = await import('@/lib/results');
type Input = Parameters<typeof computeSurveyResults>[0];

describe('cálculo do eNPS', () => {
  it('9–10 promotor, 7–8 neutro, 0–6 detrator', () => {
    expect([0, 6, 7, 8, 9, 10].map(enpsCategory)).toEqual(['DETRATOR', 'DETRATOR', 'NEUTRO', 'NEUTRO', 'PROMOTOR', 'PROMOTOR']);
  });

  it('% promotores − % detratores', () => {
    // 5 promotores, 3 neutros, 2 detratores em 10 → 50 − 20 = 30
    const r = computeEnps([10, 10, 9, 9, 9, 8, 7, 7, 3, 0]);
    expect(r).toEqual({ score: 30, promoters: 50, passives: 30, detractors: 20, respondents: 10 });
  });

  it('extremos e lista vazia', () => {
    expect(computeEnps([10, 9]).score).toBe(100);
    expect(computeEnps([0, 1]).score).toBe(-100);
    expect(computeEnps([]).respondents).toBe(0);
    expect(computeEnps([11, -1, 5.5]).respondents).toBe(0);
  });

  it('faixas de leitura', () => {
    expect(classifyEnps(80).label).toBe('Excelência');
    expect(classifyEnps(50).label).toBe('Qualidade');
    expect(classifyEnps(0).label).toBe('Aperfeiçoamento');
    expect(classifyEnps(-1).label).toBe('Crítica');
  });

  it('a pergunta de eNPS é sempre escala de 0 a 10', () => {
    expect(enpsQuestionFields({ type: 'LIKERT', scaleMin: 1, scaleMax: 5, isEnps: true }))
      .toEqual({ type: 'SCALE', scaleMin: 0, scaleMax: 10, isEnps: true });
    expect(enpsQuestionFields({ type: 'LIKERT', isEnps: false })).toEqual({ type: 'LIKERT', isEnps: false });
  });
});

/** Pesquisa encerrada com N pessoas em um setor/unidade; cada uma dá Likert 4 e o eNPS indicado. */
function pesquisa(grupos: { sector: string; unit: string; enps: number[] }[], threshold = 5): Input {
  const responses: Input['responses'] = [];
  const answers: Input['answers'] = [];
  let i = 0;
  for (const g of grupos) {
    for (const nota of g.enps) {
      const id = `r${i++}`;
      responses.push({ id, sectorId: g.sector, sectorName: `Setor ${g.sector}`, unitId: g.unit, unitName: `Loja ${g.unit}` });
      answers.push({ responseId: id, questionId: 'likert', numericValue: 4 });
      answers.push({ responseId: id, questionId: 'enps', numericValue: nota });
    }
  }
  return {
    survey: { id: 's', name: 'S', status: 'CLOSED', eligiblePopulation: null, anonymityThreshold: threshold },
    questions: [
      { id: 'likert', text: 'L', type: 'LIKERT', dimensionId: 'd', dimensionName: 'D' },
      { id: 'enps', text: 'E', type: 'SCALE', dimensionId: null, dimensionName: null, isEnps: true },
    ],
    responses,
    answers,
  };
}

describe('eNPS nos resultados respeita o anonimato', () => {
  it('sem a pergunta, não há eNPS', () => {
    const input = pesquisa([{ sector: 'a', unit: 'u', enps: [10, 10, 10, 10, 10] }]);
    input.questions = input.questions.filter((q) => !q.isEnps);
    expect(computeSurveyResults(input).enps).toBeNull();
  });

  it('pesquisa aberta não mostra eNPS', () => {
    const input = pesquisa([{ sector: 'a', unit: 'u', enps: [10, 10, 10, 10, 10] }]);
    input.survey.status = 'OPEN';
    expect(computeSurveyResults(input).enps).toBeNull();
  });

  it('menos pessoas que o limite responderam o eNPS → nada', () => {
    const input = pesquisa([{ sector: 'a', unit: 'u', enps: [10, 10, 10, 10, 10, 10] }]);
    // Só 4 das 6 pessoas responderam o eNPS.
    input.answers = input.answers.filter((a) => !(a.questionId === 'enps' && ['r4', 'r5'].includes(a.responseId)));
    expect(computeSurveyResults(input).enps).toBeNull();
  });

  it('setor pequeno fica oculto (e o complemento também, para não sair por subtração)', () => {
    const r = computeSurveyResults(pesquisa([
      { sector: 'grande', unit: 'u', enps: [10, 10, 9, 9, 8, 7, 3] },
      { sector: 'pequeno', unit: 'u', enps: [0, 0] },
    ]));
    expect(r.enps).not.toBeNull();
    expect(r.enps!.respondents).toBe(9);
    const pequeno = r.enps!.bySector.find((g) => g.id === 'pequeno')!;
    expect(pequeno.visible).toBe(false);
    expect(pequeno.score).toBeNull();
    expect(pequeno.respondents).toBeNull();
    // Com dois setores e um oculto, o outro sairia por subtração do total.
    const grande = r.enps!.bySector.find((g) => g.id === 'grande')!;
    expect(grande.visible).toBe(false);
  });

  it('setores grandes aparecem com o próprio eNPS', () => {
    const r = computeSurveyResults(pesquisa([
      { sector: 'a', unit: 'u', enps: [10, 10, 10, 10, 10] },
      { sector: 'b', unit: 'u', enps: [0, 0, 0, 0, 0] },
    ]));
    expect(r.enps!.score).toBe(0);
    expect(r.enps!.bySector.map((g) => [g.id, g.score])).toEqual([['a', 100], ['b', -100]]);
  });
});
