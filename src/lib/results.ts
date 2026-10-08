import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  average,
  climateIndex,
  classifyClimateIndex,
  favorabilityBreakdown,
  participationRate,
  classifyParticipation,
  standardDeviation,
  round1,
} from './calculations';
import { effectiveThreshold, resultsReleased } from './anonymity';
import { suppressCrossTab, type CrossCell } from './disclosure';
import { buildRecommendations } from './recommendations';
import { countByTheme, classifySentiment } from './themes';
import { buildWordFrequencies } from './wordcloud';
import { classifyEnps, computeEnps, type EnpsBreakdown } from './enps';

/**
 * Por que um resultado não traz números:
 * - SURVEY_OPEN: a pesquisa ainda recebe respostas (ver resultsReleased).
 * - BELOW_THRESHOLD: menos pessoas que o limite deram nota na pesquisa
 *   inteira — o índice geral seria a nota delas.
 */
export type ResultsLock = 'SURVEY_OPEN' | 'BELOW_THRESHOLD';

export function lockMessage(lock: ResultsLock, threshold: number): string {
  if (lock === 'SURVEY_OPEN') {
    return 'Os resultados ficam disponíveis quando a pesquisa for encerrada. Com ela aberta, comparar o painel antes e depois de alguém responder revelaria a resposta daquela pessoa.';
  }
  return `Menos de ${threshold} pessoas responderam. Com tão poucas respostas, qualquer número exibido seria a resposta de alguém identificável — por isso nada é mostrado.`;
}

export interface DimensionResult {
  dimensionId: string;
  dimension: string;
  average: number;
  index: number;
  favorable: number;
  neutral: number;
  unfavorable: number;
  /** Pessoas que deram nota na dimensão (não o número de notas). */
  responseCount: number;
  classification: ReturnType<typeof classifyClimateIndex>;
}

/**
 * `responseCount` é nulo em grupo oculto: dizer que o setor oculto tem 1
 * pessoa já é meio caminho para descobrir quem é, e a contagem permitia
 * isolar o grupo por subtração do total.
 */
export interface SectorResult {
  sectorId: string;
  sector: string;
  responseCount: number | null;
  visible: boolean;
  hiddenReason: string | null;
  average: number | null;
  index: number | null;
  favorable: number | null;
  neutral: number | null;
  unfavorable: number | null;
  participationRate: number | null;
}

export interface HeatmapCell {
  sectorId: string;
  sector: string;
  dimensionId: string;
  dimension: string;
  index: number | null;
  visible: boolean;
  responseCount: number | null;
}

export interface UnitResult {
  unitId: string;
  unit: string;
  responseCount: number | null;
  visible: boolean;
  hiddenReason: string | null;
  average: number | null;
  index: number | null;
  favorable: number | null;
  neutral: number | null;
  unfavorable: number | null;
  participationRate: number | null;
}

export interface UnitHeatmapCell {
  unitId: string;
  unit: string;
  dimensionId: string;
  dimension: string;
  index: number | null;
  visible: boolean;
  responseCount: number | null;
}

export interface QuestionResult {
  questionId: string;
  text: string;
  dimension: string | null;
  favorable: number;
  responseCount: number;
}

export interface SurveyResultsSummary {
  surveyId: string;
  surveyName: string;
  status: string;
  /** Nulo = números liberados. Com trava, só a participação vem preenchida. */
  locked: ResultsLock | null;
  lockedReason: string | null;
  /** Pessoas com ao menos uma resposta válida (participação, não conteúdo). */
  totalResponses: number;
  eligiblePopulation: number | null;
  participationRate: number;
  participationClassification: string;
  climateIndex: number;
  climateClassification: ReturnType<typeof classifyClimateIndex>;
  standardDeviation: number;
  favorability: { favorable: number; neutral: number; unfavorable: number };
  byDimension: DimensionResult[];
  bySector: SectorResult[];
  heatmap: HeatmapCell[];
  byUnit: UnitResult[];
  unitHeatmap: UnitHeatmapCell[];
  topStrengths: QuestionResult[];
  topCritical: QuestionResult[];
  recommendations: ReturnType<typeof buildRecommendations>;
  insights: string[];
  /** Perguntas Likert deixadas fora de todo número por terem menos pessoas que o limite. */
  excludedQuestions: number;
  anonymityThreshold: number;
  /** eNPS, quando a pesquisa tem a pergunta e ela passou do limite de anonimato. */
  enps: EnpsResult | null;
}

export interface EnpsGroup {
  id: string;
  name: string;
  visible: boolean;
  score: number | null;
  respondents: number | null;
}

export interface EnpsResult extends EnpsBreakdown {
  classification: ReturnType<typeof classifyEnps>;
  bySector: EnpsGroup[];
  byUnit: EnpsGroup[];
}

const HIDDEN_REASON = 'Resultados ocultados para preservar o anonimato devido ao baixo número de respostas.';

// --- Entrada do cálculo (já carregada do banco) ----------------------------

export interface ResultsInput {
  survey: {
    id: string;
    name: string;
    status: string;
    eligiblePopulation: number | null;
    anonymityThreshold: number | null;
  };
  questions: {
    id: string;
    text: string;
    type: string;
    dimensionId: string | null;
    dimensionName: string | null;
    /** Pergunta de eNPS (escala 0–10) — ver src/lib/enps.ts. */
    isEnps?: boolean;
    /** Pergunta removida (soft-delete) fica fora do eNPS. */
    active?: boolean;
  }[];
  responses: {
    id: string;
    sectorId: string;
    sectorName: string;
    unitId: string | null;
    unitName: string | null;
  }[];
  answers: {
    responseId: string;
    questionId: string;
    numericValue: number | null;
    textValue?: string | null;
  }[];
}

interface LikertAnswer {
  responseId: string;
  questionId: string;
  dimensionId: string | null;
  value: number;
}

function guardedStats(values: number[]) {
  const fav = favorabilityBreakdown(values);
  return {
    average: round1(average(values)),
    index: round1(climateIndex(values)),
    favorable: fav.favorable,
    neutral: fav.neutral,
    unfavorable: fav.unfavorable,
  };
}

/**
 * Núcleo do cálculo de resultados — puro, sem banco. Toda tela, exportação e
 * comparação passa por aqui, então as regras de anonimato valem igual em
 * todo lugar:
 *
 * 1. Nada de números com a pesquisa aberta (SURVEY_OPEN).
 * 2. A pergunta é a unidade mínima: pergunta Likert respondida por menos
 *    pessoas que o limite fica fora de TODO número (geral, dimensão, setor,
 *    célula). Se ela entrasse na média da dimensão, a diferença entre a
 *    dimensão e as outras perguntas revelaria a nota de quem a respondeu.
 * 3. Menos pessoas que o limite na pesquisa inteira → nada (BELOW_THRESHOLD).
 * 4. Setores e unidades passam pelo controle de divulgação
 *    (src/lib/disclosure.ts): limite, complemento e cruzamento.
 * 5. Cada coluna do mapa de calor passa pelo mesmo controle, com as pessoas
 *    que responderam aquela dimensão — e herda o que já está oculto no geral.
 */
export function computeSurveyResults(input: ResultsInput): SurveyResultsSummary {
  const { survey } = input;
  const threshold = effectiveThreshold(survey.anonymityThreshold);
  const questionById = new Map(input.questions.map((q) => [q.id, q]));

  // Envio sem nenhuma resposta gravada não é uma pessoa: fica fora da
  // participação e dos recortes (a rota pública já recusa envios assim).
  const respondentIds = new Set(input.answers.map((a) => a.responseId));
  const responses = input.responses.filter((r) => respondentIds.has(r.id));
  const responseById = new Map(responses.map((r) => [r.id, r]));
  const totalResponses = responses.length;
  const pRate = participationRate(totalResponses, survey.eligiblePopulation);

  const base: SurveyResultsSummary = {
    surveyId: survey.id,
    surveyName: survey.name,
    status: survey.status,
    locked: null,
    lockedReason: null,
    totalResponses,
    eligiblePopulation: survey.eligiblePopulation,
    participationRate: pRate,
    participationClassification: classifyParticipation(pRate).label,
    climateIndex: 0,
    climateClassification: classifyClimateIndex(0),
    standardDeviation: 0,
    favorability: { favorable: 0, neutral: 0, unfavorable: 0 },
    byDimension: [],
    bySector: [],
    heatmap: [],
    byUnit: [],
    unitHeatmap: [],
    topStrengths: [],
    topCritical: [],
    recommendations: [],
    insights: [],
    excludedQuestions: 0,
    anonymityThreshold: threshold,
    enps: null,
  };
  const locked = (lock: ResultsLock): SurveyResultsSummary => ({
    ...base,
    locked: lock,
    lockedReason: lockMessage(lock, threshold),
  });

  if (!resultsReleased(survey.status)) return locked('SURVEY_OPEN');

  // --- Notas Likert e quais perguntas podem entrar em algum número ---------
  const allLikert: LikertAnswer[] = [];
  const respondentsByQuestion = new Map<string, Set<string>>();
  for (const a of input.answers) {
    const q = questionById.get(a.questionId);
    if (!q || q.type !== 'LIKERT' || a.numericValue === null || !responseById.has(a.responseId)) continue;
    allLikert.push({ responseId: a.responseId, questionId: q.id, dimensionId: q.dimensionId, value: a.numericValue });
    const set = respondentsByQuestion.get(q.id) ?? new Set<string>();
    set.add(a.responseId);
    respondentsByQuestion.set(q.id, set);
  }
  const publishableQuestions = new Set(
    Array.from(respondentsByQuestion.entries()).filter(([, ids]) => ids.size >= threshold).map(([id]) => id),
  );
  const likert = allLikert.filter((a) => publishableQuestions.has(a.questionId));
  const excludedQuestions = respondentsByQuestion.size - publishableQuestions.size;

  const likertRespondents = new Set(likert.map((a) => a.responseId));
  if (likertRespondents.size < threshold) return { ...locked('BELOW_THRESHOLD'), excludedQuestions };

  // --- Geral ----------------------------------------------------------------
  const allValues = likert.map((a) => a.value);
  const overallIndex = climateIndex(allValues);
  const overallFav = favorabilityBreakdown(allValues);

  // --- Por dimensão ---------------------------------------------------------
  const dimensionMap = new Map<string, { name: string; values: number[]; respondents: Set<string> }>();
  for (const a of likert) {
    if (!a.dimensionId) continue;
    const entry = dimensionMap.get(a.dimensionId) ?? {
      name: questionById.get(a.questionId)?.dimensionName ?? 'Sem dimensão',
      values: [],
      respondents: new Set<string>(),
    };
    entry.values.push(a.value);
    entry.respondents.add(a.responseId);
    dimensionMap.set(a.dimensionId, entry);
  }
  const byDimension: DimensionResult[] = Array.from(dimensionMap.entries())
    .map(([dimensionId, { name, values, respondents }]) => {
      const stats = guardedStats(values);
      return {
        dimensionId,
        dimension: name,
        ...stats,
        responseCount: respondents.size,
        classification: classifyClimateIndex(stats.index),
      };
    })
    .sort((a, b) => b.index - a.index);

  // --- Setor e unidade: controle de divulgação ------------------------------
  const crossCells = (answers: LikertAnswer[]): CrossCell[] => {
    const people = new Map<string, { unit: string | null; sector: string; ids: Set<string> }>();
    for (const a of answers) {
      const r = responseById.get(a.responseId)!;
      const key = `${r.unitId ?? ''}\u0000${r.sectorId}`;
      const entry = people.get(key) ?? { unit: r.unitId, sector: r.sectorId, ids: new Set<string>() };
      entry.ids.add(a.responseId);
      people.set(key, entry);
    }
    return Array.from(people.values()).map((p) => ({ unit: p.unit, sector: p.sector, count: p.ids.size }));
  };
  const overall = suppressCrossTab(crossCells(likert), threshold);

  type Resp = (typeof responses)[number];
  const groupValues = (pick: (r: Resp) => string | null, nameOf: (r: Resp) => string) => {
    const groups = new Map<string, { name: string; values: number[] }>();
    for (const a of likert) {
      const r = responseById.get(a.responseId)!;
      const key = pick(r);
      if (key === null) continue;
      const entry = groups.get(key) ?? { name: nameOf(r), values: [] };
      entry.values.push(a.value);
      groups.set(key, entry);
    }
    return groups;
  };
  const peopleIn = (pick: (r: Resp) => string | null) => {
    const counts = new Map<string, Set<string>>();
    for (const id of Array.from(likertRespondents)) {
      const key = pick(responseById.get(id)!);
      if (key === null) continue;
      const set = counts.get(key) ?? new Set<string>();
      set.add(id);
      counts.set(key, set);
    }
    return counts;
  };

  const sectorGroups = groupValues((r) => r.sectorId, (r) => r.sectorName);
  const sectorPeople = peopleIn((r) => r.sectorId);
  const bySector: SectorResult[] = Array.from(sectorGroups.entries())
    .map(([sectorId, { name, values }]) => {
      const visible = overall.visibleSectors.has(sectorId);
      const stats = visible ? guardedStats(values) : null;
      return {
        sectorId,
        sector: name,
        responseCount: visible ? sectorPeople.get(sectorId)?.size ?? 0 : null,
        visible,
        hiddenReason: visible ? null : HIDDEN_REASON,
        average: stats?.average ?? null,
        index: stats?.index ?? null,
        favorable: stats?.favorable ?? null,
        neutral: stats?.neutral ?? null,
        unfavorable: stats?.unfavorable ?? null,
        participationRate: null,
      };
    })
    .sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || a.sector.localeCompare(b.sector));

  const unitGroups = groupValues((r) => r.unitId, (r) => r.unitName ?? 'Sem unidade');
  const unitPeople = peopleIn((r) => r.unitId);
  const byUnit: UnitResult[] = Array.from(unitGroups.entries())
    .map(([unitId, { name, values }]) => {
      const visible = overall.visibleUnits.has(unitId);
      const stats = visible ? guardedStats(values) : null;
      return {
        unitId,
        unit: name,
        responseCount: visible ? unitPeople.get(unitId)?.size ?? 0 : null,
        visible,
        hiddenReason: visible ? null : HIDDEN_REASON,
        average: stats?.average ?? null,
        index: stats?.index ?? null,
        favorable: stats?.favorable ?? null,
        neutral: stats?.neutral ?? null,
        unfavorable: stats?.unfavorable ?? null,
        participationRate: null,
      };
    })
    .sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || a.unit.localeCompare(b.unit));

  // --- Mapas de calor: o mesmo controle por coluna (dimensão) ---------------
  const hiddenSectors = bySector.filter((s) => !s.visible).map((s) => s.sectorId);
  const hiddenUnits = byUnit.filter((u) => !u.visible).map((u) => u.unitId);
  const heatmap: HeatmapCell[] = [];
  const unitHeatmap: UnitHeatmapCell[] = [];
  for (const dim of byDimension) {
    const dimAnswers = likert.filter((a) => a.dimensionId === dim.dimensionId);
    const column = suppressCrossTab(crossCells(dimAnswers), threshold, {
      forceHiddenSectors: hiddenSectors,
      forceHiddenUnits: hiddenUnits,
    });
    const valuesBy = (pick: (r: Resp) => string | null) => {
      const map = new Map<string, { values: number[]; people: Set<string> }>();
      for (const a of dimAnswers) {
        const key = pick(responseById.get(a.responseId)!);
        if (key === null) continue;
        const entry = map.get(key) ?? { values: [], people: new Set<string>() };
        entry.values.push(a.value);
        entry.people.add(a.responseId);
        map.set(key, entry);
      }
      return map;
    };
    const bySectorInDim = valuesBy((r) => r.sectorId);
    for (const s of bySector) {
      const cell = bySectorInDim.get(s.sectorId);
      const visible = Boolean(cell) && column.visibleSectors.has(s.sectorId);
      heatmap.push({
        sectorId: s.sectorId,
        sector: s.sector,
        dimensionId: dim.dimensionId,
        dimension: dim.dimension,
        index: visible ? round1(climateIndex(cell!.values)) : null,
        visible,
        responseCount: visible ? cell!.people.size : null,
      });
    }
    const byUnitInDim = valuesBy((r) => r.unitId);
    for (const u of byUnit) {
      const cell = byUnitInDim.get(u.unitId);
      const visible = Boolean(cell) && column.visibleUnits.has(u.unitId);
      unitHeatmap.push({
        unitId: u.unitId,
        unit: u.unit,
        dimensionId: dim.dimensionId,
        dimension: dim.dimension,
        index: visible ? round1(climateIndex(cell!.values)) : null,
        visible,
        responseCount: visible ? cell!.people.size : null,
      });
    }
  }

  // --- Pontos fortes / críticos (por pergunta, agregado geral) --------------
  const valuesByQuestion = new Map<string, number[]>();
  for (const a of likert) {
    const arr = valuesByQuestion.get(a.questionId) ?? [];
    arr.push(a.value);
    valuesByQuestion.set(a.questionId, arr);
  }
  const questionResults: QuestionResult[] = Array.from(valuesByQuestion.entries()).map(([questionId, values]) => {
    const q = questionById.get(questionId)!;
    return {
      questionId,
      text: q.text,
      dimension: q.dimensionName,
      favorable: favorabilityBreakdown(values).favorable,
      responseCount: respondentsByQuestion.get(questionId)!.size,
    };
  });
  const topStrengths = [...questionResults].sort((a, b) => b.favorable - a.favorable).slice(0, 10);
  const topCritical = [...questionResults].sort((a, b) => a.favorable - b.favorable).slice(0, 10);

  const enps = computeEnpsResult(input, responseById, threshold, {
    hiddenSectors,
    hiddenUnits,
    sectorNames: new Map(bySector.map((s) => [s.sectorId, s.sector])),
    unitNames: new Map(byUnit.map((u) => [u.unitId, u.unit])),
  });

  return {
    ...base,
    climateIndex: round1(overallIndex),
    climateClassification: classifyClimateIndex(overallIndex),
    standardDeviation: round1(standardDeviation(allValues)),
    favorability: { favorable: overallFav.favorable, neutral: overallFav.neutral, unfavorable: overallFav.unfavorable },
    byDimension,
    bySector,
    heatmap,
    byUnit,
    unitHeatmap,
    topStrengths,
    topCritical,
    recommendations: buildRecommendations(byDimension.map((d) => ({ name: d.dimension, index: d.index }))),
    insights: buildInsights(byDimension, bySector, overallIndex),
    excludedQuestions,
    enps,
  };
}

/**
 * eNPS com as mesmas travas dos outros números:
 * - menos pessoas que o limite responderam a pergunta → nada;
 * - setor/unidade passam pelo controle de divulgação com quem respondeu o
 *   eNPS, e herdam o que já está oculto no geral (como uma coluna do mapa de calor).
 * As rotas de pergunta aceitam uma só pergunta de eNPS por pesquisa; se
 * mesmo assim houver duas (dados antigos), vale a de menor id — duas notas da
 * mesma pessoa não podem virar duas pessoas.
 */
function computeEnpsResult(
  input: ResultsInput,
  responseById: Map<string, ResultsInput['responses'][number]>,
  threshold: number,
  ctx: { hiddenSectors: string[]; hiddenUnits: string[]; sectorNames: Map<string, string>; unitNames: Map<string, string> },
): EnpsResult | null {
  const [enpsQuestion] = input.questions.filter((q) => q.isEnps && q.active !== false).sort((a, b) => a.id.localeCompare(b.id));
  if (!enpsQuestion) return null;

  const answers = input.answers.filter(
    (a) => a.questionId === enpsQuestion.id && a.numericValue !== null && responseById.has(a.responseId),
  );
  if (new Set(answers.map((a) => a.responseId)).size < threshold) return null;

  const overall = computeEnps(answers.map((a) => a.numericValue!));

  const cells = new Map<string, { unit: string | null; sector: string; ids: Set<string> }>();
  for (const a of answers) {
    const r = responseById.get(a.responseId)!;
    const key = `${r.unitId ?? ''}\u0000${r.sectorId}`;
    const entry = cells.get(key) ?? { unit: r.unitId, sector: r.sectorId, ids: new Set<string>() };
    entry.ids.add(a.responseId);
    cells.set(key, entry);
  }
  const column = suppressCrossTab(
    Array.from(cells.values()).map((c) => ({ unit: c.unit, sector: c.sector, count: c.ids.size })),
    threshold,
    { forceHiddenSectors: ctx.hiddenSectors, forceHiddenUnits: ctx.hiddenUnits },
  );

  const group = (pick: (r: ResultsInput['responses'][number]) => string | null, visibleSet: Set<string>, names: Map<string, string>) => {
    const values = new Map<string, number[]>();
    for (const a of answers) {
      const key = pick(responseById.get(a.responseId)!);
      if (key === null) continue;
      const arr = values.get(key) ?? [];
      arr.push(a.numericValue!);
      values.set(key, arr);
    }
    return Array.from(values.entries())
      .map(([id, vals]): EnpsGroup => {
        const visible = visibleSet.has(id);
        return {
          id,
          name: names.get(id) ?? '—',
          visible,
          score: visible ? computeEnps(vals).score : null,
          respondents: visible ? vals.length : null,
        };
      })
      .sort((a, b) => (b.score ?? -101) - (a.score ?? -101) || a.name.localeCompare(b.name));
  };

  return {
    ...overall,
    classification: classifyEnps(overall.score),
    bySector: group((r) => r.sectorId, column.visibleSectors, ctx.sectorNames),
    byUnit: group((r) => r.unitId, column.visibleUnits, ctx.unitNames),
  };
}

/** Carrega a pesquisa do banco e calcula — ver computeSurveyResults. */
export async function getSurveyResults(surveyId: string): Promise<SurveyResultsSummary | null> {
  const input = await loadResultsInput(surveyId);
  return input ? computeSurveyResults(input) : null;
}

async function loadResultsInput(surveyId: string): Promise<ResultsInput | null> {
  const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, surveyId) });
  if (!survey) return null;

  const questions = await db.query.questions.findMany({
    where: eq(schema.questions.surveyId, surveyId),
    with: { dimension: { columns: { name: true } } },
  });
  // Só as colunas usadas: nada de created_at da resposta sair do banco.
  const responses = await db.query.surveyResponses.findMany({
    where: eq(schema.surveyResponses.surveyId, surveyId),
    columns: { id: true, sectorId: true, unitId: true },
    with: { sector: { columns: { name: true } }, unit: { columns: { name: true } } },
  });
  const answers =
    responses.length === 0
      ? []
      : await db.query.responseAnswers.findMany({
          where: inArray(schema.responseAnswers.responseId, responses.map((r) => r.id)),
          columns: { responseId: true, questionId: true, numericValue: true, textValue: true },
        });

  return {
    survey: {
      id: survey.id,
      name: survey.name,
      status: survey.status,
      eligiblePopulation: survey.eligiblePopulation,
      anonymityThreshold: survey.anonymityThreshold,
    },
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      dimensionId: q.dimensionId,
      dimensionName: q.dimension?.name ?? null,
      isEnps: q.isEnps,
      active: q.active,
    })),
    responses: responses.map((r) => ({
      id: r.id,
      sectorId: r.sectorId,
      sectorName: r.sector.name,
      unitId: r.unitId,
      unitName: r.unit?.name ?? null,
    })),
    answers,
  };
}

function buildInsights(
  byDimension: DimensionResult[],
  bySector: SectorResult[],
  overallIndex: number
): string[] {
  const insights: string[] = [];
  if (byDimension.length === 0) return insights;

  const best = byDimension[0];
  const worst = byDimension[byDimension.length - 1];

  if (best && worst && best.dimensionId !== worst.dimensionId) {
    insights.push(
      `Os resultados indicam uma percepção positiva em relação a ${best.dimension} (${best.index.toFixed(
        0
      )}%), porém existem oportunidades de melhoria em ${worst.dimension} (${worst.index.toFixed(0)}%).`
    );
  }

  const visibleSectors = bySector.filter((s) => s.visible && s.index !== null);
  if (visibleSectors.length > 1) {
    const sorted = [...visibleSectors].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];
    if (weakest && strongest && weakest.sectorId !== strongest.sectorId && (strongest.index! - weakest.index!) >= 10) {
      insights.push(
        `O setor ${weakest.sector} apresentou resultado abaixo da média geral (${weakest.index}% frente a ${overallIndex.toFixed(
          0
        )}% geral), enquanto ${strongest.sector} se destacou positivamente (${strongest.index}%).`
      );
    }
  }

  const criticalDimensions = byDimension.filter((d) => d.index < 65);
  if (criticalDimensions.length > 0) {
    insights.push(
      `${criticalDimensions.length} dimensão(ões) estão abaixo do limite de atenção (65%): ${criticalDimensions
        .map((d) => d.dimension)
        .join(', ')}.`
    );
  }

  return insights;
}

// --- Comentários (respostas abertas) -------------------------------------

export interface CommentAnalysis {
  locked: ResultsLock | null;
  lockedReason: string | null;
  totalComments: number;
  /** Quantas pessoas distintas comentaram — é o que a regra de anonimato olha. */
  commentRespondents: number;
  /** true quando o conteúdo (textos, temas, nuvem) foi omitido por haver poucos comentaristas. */
  verbatimHidden: boolean;
  anonymityThreshold: number;
  byTheme: { theme: string; count: number }[];
  bySentiment: { sentiment: string; count: number }[];
  examples: { elogios: string[]; reclamacoes: string[]; sugestoes: string[] };
  wordCloud: { word: string; count: number }[];
}

/**
 * Comentários — puro, sem banco. Mesmas travas dos números (pesquisa aberta,
 * pesquisa abaixo do limite) e uma própria: com menos comentaristas que o
 * limite, nada do CONTEÚDO aparece — nem o texto, nem a nuvem, nem a contagem
 * por tema e classificação. Com 1 comentarista, "1 reclamação sobre
 * Liderança" já é o que aquela pessoa escreveu.
 */
export function computeCommentAnalysis(input: ResultsInput): CommentAnalysis {
  const threshold = effectiveThreshold(input.survey.anonymityThreshold);
  const empty: CommentAnalysis = {
    locked: null,
    lockedReason: null,
    totalComments: 0,
    commentRespondents: 0,
    verbatimHidden: false,
    anonymityThreshold: threshold,
    byTheme: [],
    bySentiment: [],
    examples: { elogios: [], reclamacoes: [], sugestoes: [] },
    wordCloud: [],
  };

  if (!resultsReleased(input.survey.status)) {
    return { ...empty, locked: 'SURVEY_OPEN', lockedReason: lockMessage('SURVEY_OPEN', threshold) };
  }
  const respondents = new Set(input.answers.map((a) => a.responseId));
  if (respondents.size < threshold) {
    return { ...empty, locked: 'BELOW_THRESHOLD', lockedReason: lockMessage('BELOW_THRESHOLD', threshold) };
  }

  const textQuestionIds = new Set(
    input.questions.filter((q) => q.type === 'SHORT_TEXT' || q.type === 'LONG_TEXT').map((q) => q.id)
  );
  const commentResponseIds = new Set<string>();
  const texts: string[] = [];
  for (const a of input.answers) {
    if (!textQuestionIds.has(a.questionId) || !a.textValue || a.textValue.trim().length === 0) continue;
    texts.push(a.textValue);
    commentResponseIds.add(a.responseId);
  }
  // Ordem alfabética, não a do banco: a ordem de gravação acompanha a ordem
  // de envio, e "o primeiro comentário" pode apontar para quem respondeu primeiro.
  texts.sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const canShow = commentResponseIds.size >= threshold;
  const base = {
    ...empty,
    totalComments: texts.length,
    commentRespondents: commentResponseIds.size,
    verbatimHidden: texts.length > 0 && !canShow,
  };
  if (!canShow) return base;

  const sentimentCounts = { elogio: 0, reclamacao: 0, sugestao: 0 };
  for (const t of texts) sentimentCounts[classifySentiment(t)] += 1;
  // Evita mostrar o mesmo comentário literal repetido no "top 5".
  const pick = (sentiment: 'elogio' | 'reclamacao' | 'sugestao') =>
    Array.from(new Set(texts.filter((t) => classifySentiment(t) === sentiment))).slice(0, 5);

  return {
    ...base,
    byTheme: countByTheme(texts).filter((t) => t.count > 0).map((t) => ({ theme: t.theme, count: t.count })),
    bySentiment: [
      { sentiment: 'Elogio', count: sentimentCounts.elogio },
      { sentiment: 'Reclamação', count: sentimentCounts.reclamacao },
      { sentiment: 'Sugestão', count: sentimentCounts.sugestao },
    ],
    examples: { elogios: pick('elogio'), reclamacoes: pick('reclamacao'), sugestoes: pick('sugestao') },
    wordCloud: buildWordFrequencies(texts),
  };
}

export async function getCommentAnalysis(surveyId: string): Promise<CommentAnalysis | null> {
  const input = await loadResultsInput(surveyId);
  return input ? computeCommentAnalysis(input) : null;
}
