/**
 * Conteúdo dos formulários de treinamento, transcrito dos formulários usados
 * hoje pelo Spot. Nada aqui é inventado: critérios, escala e rótulos são os do
 * impresso.
 *
 * Os três formulários não são iguais — gerência e novos colaboradores usam a
 * régua RUIM/MÉDIO/BOM/ÓTIMO e falam em "pontos positivos/negativos"; o do bar
 * usa RUIM/MÉDIO/BOM/NÃO e fala em "pontos fortes / de melhoria". Por isso
 * escala e rótulos são propriedades do tipo, não constantes do sistema.
 */

export type TrainingRating = 'RUIM' | 'MEDIO' | 'BOM' | 'OTIMO' | 'NAO';

export interface TrainingRatingOption {
  value: TrainingRating;
  label: string;
}

export interface TrainingContextField {
  key: string;
  label: string;
  type: 'text' | 'number';
}

export interface TrainingCriterionSeed {
  label: string;
  hint?: string;
}

export interface TrainingFormSeed {
  typeName: string;
  description?: string;
  contextFields: TrainingContextField[];
  ratingOptions: TrainingRatingOption[];
  positiveLabel: string;
  negativeLabel: string;
  criteria: TrainingCriterionSeed[];
}

/** Régua dos formulários de gerência e de novos colaboradores. */
const ESCALA_OTIMO: TrainingRatingOption[] = [
  { value: 'RUIM', label: 'Ruim' },
  { value: 'MEDIO', label: 'Médio' },
  { value: 'BOM', label: 'Bom' },
  { value: 'OTIMO', label: 'Ótimo' },
];

/** Régua do formulário do bar — a quarta opção é "Não", não um nível acima. */
const ESCALA_BAR: TrainingRatingOption[] = [
  { value: 'RUIM', label: 'Ruim' },
  { value: 'MEDIO', label: 'Médio' },
  { value: 'BOM', label: 'Bom' },
  { value: 'NAO', label: 'Não' },
];

const CABECALHO_SALAO: TrainingContextField[] = [
  { key: 'setor', label: 'Setor', type: 'text' },
  { key: 'gerentePeriodo', label: 'Gerente do período', type: 'text' },
  { key: 'diaTreinamento', label: 'Dia de treinamento', type: 'text' },
  { key: 'funcaoAbertura', label: 'Função de abertura', type: 'text' },
];

/** Formulário de treinamento de GERÊNCIA. */
export const GERENCIA_FORM: TrainingFormSeed = {
  typeName: 'Gerentes',
  contextFields: [...CABECALHO_SALAO, { key: 'pessoas', label: 'Pessoas no período', type: 'number' }],
  ratingOptions: ESCALA_OTIMO,
  positiveLabel: 'Pontos positivos',
  negativeLabel: 'Pontos negativos',
  criteria: [
    { label: 'Pontualidade', hint: 'Horário' },
    { label: 'Liderança', hint: 'Postura' },
    { label: 'Visão', hint: 'Antecipar erros' },
    { label: 'Escala', hint: 'Setores' },
    { label: 'Agilidade', hint: 'Ritmo e antecipação' },
    { label: 'Lavagem', hint: 'Higiene e organização' },
    { label: 'Jogo de cintura', hint: 'Contornar problemas e tranquilizar o cliente' },
    { label: 'Espera', hint: 'Caderno e cartões' },
    { label: 'Banheiros', hint: 'Limpeza' },
    { label: 'Fechamento', hint: 'Tudo revisado' },
    { label: 'Vigor', hint: 'Concentração' },
    { label: 'Tranquilidade', hint: 'Contornar cliente' },
    { label: 'Dinâmica', hint: 'Entre equipe' },
    { label: 'Prioridades', hint: 'Sequência de serviço' },
    { label: 'Abertura', hint: 'Checklist feito' },
    { label: 'Decisões', hint: 'Rápida e certeira' },
  ],
};

/** Formulário de treinamento de NOVOS COLABORADORES. */
export const NOVOS_FORM: TrainingFormSeed = {
  typeName: 'Novos Colaboradores',
  contextFields: CABECALHO_SALAO,
  ratingOptions: ESCALA_OTIMO,
  positiveLabel: 'Pontos positivos',
  negativeLabel: 'Pontos negativos',
  criteria: [
    { label: 'Pontualidade', hint: 'Chegou no horário' },
    { label: 'Cardápio — cozinha', hint: 'Cozinha' },
    { label: 'Cardápio — bar e vinhos', hint: 'Bar e vinhos' },
    { label: 'Boqueta', hint: 'Buscar pratos' },
    { label: 'Agilidade', hint: 'Ritmo e antecipação' },
    { label: 'Lavagem', hint: 'Higiene e organização' },
    { label: 'Jogo de cintura', hint: 'Contornar problemas e tranquilizar o cliente' },
    { label: 'Comandas', hint: 'Anotar e lançar' },
    { label: 'Recolha', hint: 'Pinças estáveis' },
    { label: 'Vigor', hint: 'Concentração' },
    { label: 'Tranquilidade', hint: 'Durante natação' },
    { label: 'Dinâmica', hint: 'Entre equipe' },
    { label: 'Prioridades', hint: 'Sequência de serviço' },
    { label: 'MEP', hint: 'Montando e sabendo todas' },
  ],
};

/** Formulário de AVALIAÇÃO DO BAR — cabeçalho só com o nome. */
export const BAR_FORM: TrainingFormSeed = {
  typeName: 'Avaliações do Bar',
  contextFields: [],
  ratingOptions: ESCALA_BAR,
  positiveLabel: 'Pontos fortes',
  negativeLabel: 'Pontos de melhoria',
  criteria: [
    { label: 'Execução de receitas', hint: 'Preparo das bebidas' },
    { label: 'Conhecimento dos rótulos', hint: 'Ingredientes e tipos' },
    { label: 'Higiene', hint: 'Pessoal e do ambiente' },
    { label: 'Organização', hint: 'Área de trabalho' },
    { label: 'Simpatia', hint: 'Com os clientes' },
    { label: 'Qualidade de serviço', hint: 'Rapidez e atenção' },
  ],
};

export const TRAINING_FORMS: TrainingFormSeed[] = [NOVOS_FORM, GERENCIA_FORM, BAR_FORM];

/** Fallback quando um tipo ainda não tem escala própria configurada. */
export const DEFAULT_RATING_OPTIONS = ESCALA_OTIMO;

export const TRAINING_RATING_LABEL: Record<TrainingRating, string> = {
  RUIM: 'Ruim',
  MEDIO: 'Médio',
  BOM: 'Bom',
  OTIMO: 'Ótimo',
  NAO: 'Não',
};
