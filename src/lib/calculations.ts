/**
 * Funções puras de cálculo de indicadores do SPOT CLIMA.
 * Mantidas sem dependências externas para serem 100% testáveis (ver tests/calculations.test.ts).
 */

export type LikertValue = 1 | 2 | 3 | 4 | 5;

export interface FavorabilityBreakdown {
  favorable: number; // % de respostas 4-5
  neutral: number; // % de respostas 3
  unfavorable: number; // % de respostas 1-2
  count: number;
}

export interface ClimateClassification {
  label: 'Excelente' | 'Bom' | 'Atenção' | 'Crítico' | 'Muito crítico';
  colorToken: 'excellent' | 'good' | 'attention' | 'critical' | 'very-critical';
}

/** Média aritmética simples de valores Likert (1-5). */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/** Mediana de um conjunto de valores. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Desvio padrão populacional. */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  const variance = average(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

/** Índice de Clima = média Likert / 5 × 100. */
export function climateIndex(values: number[]): number {
  if (values.length === 0) return 0;
  return (average(values) / 5) * 100;
}

/** Distribuição de favorabilidade (4-5 favorável, 3 neutro, 1-2 desfavorável). */
export function favorabilityBreakdown(values: number[]): FavorabilityBreakdown {
  const count = values.length;
  if (count === 0) return { favorable: 0, neutral: 0, unfavorable: 0, count: 0 };
  const favorable = values.filter((v) => v >= 4).length;
  const neutral = values.filter((v) => v === 3).length;
  const unfavorable = values.filter((v) => v <= 2).length;
  return {
    favorable: round1((favorable / count) * 100),
    neutral: round1((neutral / count) * 100),
    unfavorable: round1((unfavorable / count) * 100),
    count,
  };
}

/** Classificação do índice de clima conforme faixas definidas pelo RH. */
export function classifyClimateIndex(indexValue: number): ClimateClassification {
  if (indexValue >= 85) return { label: 'Excelente', colorToken: 'excellent' };
  if (indexValue >= 75) return { label: 'Bom', colorToken: 'good' };
  if (indexValue >= 65) return { label: 'Atenção', colorToken: 'attention' };
  if (indexValue >= 50) return { label: 'Crítico', colorToken: 'critical' };
  return { label: 'Muito crítico', colorToken: 'very-critical' };
}

/** Taxa de participação = respostas / população elegível × 100. */
export function participationRate(responses: number, eligiblePopulation: number | null | undefined): number {
  if (!eligiblePopulation || eligiblePopulation <= 0) return 0;
  return round1((responses / eligiblePopulation) * 100);
}

export interface ParticipationClassification {
  label: 'Excelente participação' | 'Muito boa' | 'Boa' | 'Moderada' | 'Baixa';
}

export function classifyParticipation(rate: number): ParticipationClassification {
  if (rate >= 90) return { label: 'Excelente participação' };
  if (rate >= 80) return { label: 'Muito boa' };
  if (rate >= 70) return { label: 'Boa' };
  if (rate >= 60) return { label: 'Moderada' };
  return { label: 'Baixa' };
}

/** Variação em pontos percentuais entre duas medições, arredondada a 1 casa decimal. */
export function percentagePointDelta(current: number, previous: number): number {
  return round1(current - previous);
}

export type Trend = 'up' | 'down' | 'stable';

/** Classifica a tendência com uma margem morta de 1 p.p. para evitar ruído. */
export function trendFromDelta(delta: number, deadband = 1): Trend {
  if (delta > deadband) return 'up';
  if (delta < -deadband) return 'down';
  return 'stable';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export { round1 };
