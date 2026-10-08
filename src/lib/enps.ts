/**
 * eNPS — Employee Net Promoter Score.
 *
 * Uma pergunta de 0 a 10 ("Quanto você recomendaria o Spot como lugar para
 * trabalhar?"). Quem dá 9 ou 10 é promotor, 7 ou 8 é neutro, 0 a 6 é
 * detrator. eNPS = % promotores − % detratores, de −100 a +100.
 *
 * Complementa o Índice de Clima (que é a média das escalas de 1 a 5): é um
 * número só, fácil de acompanhar de um ciclo para o outro e de comparar com
 * outras empresas.
 */

export const ENPS_DEFAULT_TEXT =
  'Numa escala de 0 a 10, quanto você recomendaria o Spot como um bom lugar para trabalhar a um amigo ou parente?';

export interface EnpsBreakdown {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** Pessoas que responderam a pergunta. */
  respondents: number;
}

export function enpsCategory(value: number): 'PROMOTOR' | 'NEUTRO' | 'DETRATOR' {
  if (value >= 9) return 'PROMOTOR';
  if (value >= 7) return 'NEUTRO';
  return 'DETRATOR';
}

/** Percentuais arredondados; o eNPS sai da diferença dos valores exatos. */
export function computeEnps(values: number[]): EnpsBreakdown {
  const valid = values.filter((v) => Number.isInteger(v) && v >= 0 && v <= 10);
  const n = valid.length;
  if (n === 0) return { score: 0, promoters: 0, passives: 0, detractors: 0, respondents: 0 };
  let p = 0;
  let d = 0;
  for (const v of valid) {
    const c = enpsCategory(v);
    if (c === 'PROMOTOR') p++;
    else if (c === 'DETRATOR') d++;
  }
  const pct = (x: number) => Math.round((x / n) * 1000) / 10;
  return {
    score: Math.round(((p - d) / n) * 100),
    promoters: pct(p),
    passives: pct(n - p - d),
    detractors: pct(d),
    respondents: n,
  };
}

/** Faixas de leitura mais usadas para NPS/eNPS. `zone` é a frase pronta para a tela. */
export function classifyEnps(score: number): { label: string; zone: string; color: string } {
  if (score >= 75) return { label: 'Excelência', zone: 'Zona de excelência', color: '#0f7a3d' };
  if (score >= 50) return { label: 'Qualidade', zone: 'Zona de qualidade', color: '#4fa84b' };
  if (score >= 0) return { label: 'Aperfeiçoamento', zone: 'Zona de aperfeiçoamento', color: '#e8b400' };
  return { label: 'Crítica', zone: 'Zona crítica', color: '#d64545' };
}

/** Uma pergunta de eNPS é sempre uma escala de 0 a 10, qualquer que seja o que veio do formulário. */
export function enpsQuestionFields<T extends { type?: string; scaleMin?: number | null; scaleMax?: number | null; isEnps?: boolean }>(
  data: T,
): T {
  if (!data.isEnps) return data;
  return { ...data, type: 'SCALE', scaleMin: 0, scaleMax: 10 } as T;
}
