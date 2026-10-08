/**
 * Recomendações automáticas — geradas quando o índice de uma dimensão fica
 * abaixo do limite (padrão 65%). São sempre sugestões, nunca ações
 * automáticas obrigatórias — o RH decide o que criar como Plano de Ação.
 */

export const RECOMMENDATION_THRESHOLD = 65;

const RECOMMENDATIONS_BY_DIMENSION: Record<string, string[]> = {
  'Comunicação': [
    'Reforçar a comunicação dos gestores com suas equipes.',
    'Criar um calendário de comunicados internos.',
    'Melhorar a comunicação de mudanças organizacionais.',
    'Criar um canal oficial de comunicação interna.',
    'Reforçar a utilização do Convenia para avisos importantes.',
    'Criar reuniões rápidas (dailies) de alinhamento por setor.',
  ],
  'Desenvolvimento e Carreira': [
    'Criar trilhas de treinamento por função.',
    'Estruturar um plano de carreira formal.',
    'Implantar um programa de mentoria interna.',
    'Criar um calendário anual de treinamentos.',
    'Criar avaliações periódicas de desenvolvimento.',
  ],
  'Liderança e Gestão': [
    'Oferecer treinamento de liderança para gestores.',
    'Instituir feedback 1:1 recorrente.',
    'Criar reuniões individuais periódicas entre líder e equipe.',
    'Investir na capacitação contínua dos gestores.',
    'Realizar avaliação de liderança (ex.: 180°/360°).',
  ],
  'Bem-estar': [
    'Avaliar a carga de trabalho por setor.',
    'Revisar escalas de trabalho.',
    'Criar ações voltadas ao bem-estar dos colaboradores.',
    'Reforçar os canais de apoio disponíveis.',
    'Avaliar os principais fatores de estresse relatados.',
  ],
  'Reconhecimento e Justiça': [
    'Criar um programa formal de reconhecimento.',
    'Revisar critérios de promoção e aumento salarial e comunicá-los com transparência.',
    'Criar rituais de reconhecimento em equipe (ex.: destaque do mês).',
  ],
  'Inclusão e Respeito': [
    'Reforçar treinamentos sobre diversidade e inclusão.',
    'Divulgar e fortalecer canais de denúncia e apoio.',
    'Revisar políticas internas quanto à equidade.',
  ],
  'Colaboração e Inovação': [
    'Criar espaços estruturados para troca de ideias entre equipes.',
    'Reconhecer publicamente soluções criativas propostas pelos colaboradores.',
    'Fomentar projetos multidisciplinares entre setores.',
  ],
  'Flexibilidade e Equilíbrio': [
    'Revisar o modelo de trabalho considerando as necessidades relatadas.',
    'Avaliar ajustes de horário onde a operação permitir.',
    'Comunicar com clareza as opções de flexibilidade já existentes.',
  ],
  'Experiência Geral': [
    'Aprofundar a análise por dimensão específica antes de agir — este indicador é um resumo, não um diagnóstico.',
    'Revisar os principais pontos críticos identificados nas demais dimensões.',
  ],
};

export interface DimensionRecommendation {
  dimension: string;
  index: number;
  suggestions: string[];
}

export function recommendationsForDimension(dimensionName: string, index: number): DimensionRecommendation | null {
  if (index >= RECOMMENDATION_THRESHOLD) return null;
  const suggestions = RECOMMENDATIONS_BY_DIMENSION[dimensionName] ?? [
    'Aprofundar a análise qualitativa desta dimensão com o setor responsável.',
    'Considerar uma escuta ativa (grupo focal) com colaboradores do setor mais impactado.',
  ];
  return { dimension: dimensionName, index, suggestions };
}

export function buildRecommendations(
  dimensionIndexes: { name: string; index: number }[]
): DimensionRecommendation[] {
  return dimensionIndexes
    .map((d) => recommendationsForDimension(d.name, d.index))
    .filter((r): r is DimensionRecommendation => r !== null);
}
