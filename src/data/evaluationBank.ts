/**
 * Banco fixo de perguntas da Avaliação de Experiência (90 dias / 2 ciclos de
 * 45), extraído do formulário original usado pelo RH ("AVALIAÇÃO DE
 * DESEMPENHO - RH SPOT"). Conteúdo fixo em código, não editável pelo admin —
 * mesmo papel de src/data/surveyBank.ts para a pesquisa de clima.
 *
 * As `key`s das dimensões espelham os prefixos de coluna em
 * performanceEvaluations (ex.: 'flexibility' -> flexibilityRating /
 * flexibilitySubAnswers), para o formulário e a gravação usarem o mesmo nome
 * sem precisar de tabela de mapeamento.
 */

export type SubAnswerOption = 'SIM' | 'NAO' | 'TALVEZ' | 'REGULAR';
export type RatingOption = 'OTIMO' | 'BOM' | 'REGULAR' | 'RUIM';

export interface SubQuestion {
  key: string;
  text: string;
  options: SubAnswerOption[];
}

export interface EvaluationDimension {
  key: 'flexibility' | 'interest' | 'relationship' | 'learning';
  name: string;
  gradedQuestion: string;
  subQuestions: SubQuestion[];
}

export const RATING_OPTIONS: RatingOption[] = ['OTIMO', 'BOM', 'REGULAR', 'RUIM'];
export const RATING_LABELS: Record<RatingOption, string> = { OTIMO: 'Ótimo', BOM: 'Bom', REGULAR: 'Regular', RUIM: 'Ruim' };
export const SUB_ANSWER_LABELS: Record<SubAnswerOption, string> = { SIM: 'Sim', NAO: 'Não', TALVEZ: 'Talvez', REGULAR: 'Regular' };

export const EVALUATION_DIMENSIONS: EvaluationDimension[] = [
  {
    key: 'flexibility',
    name: 'Flexibilidade e Adaptação ao trabalho',
    gradedQuestion: 'Adaptação do funcionário à equipe, às atribuições e à cultura da empresa.',
    subQuestions: [
      { key: 'q1', text: 'Suas características pessoais são compatíveis aos requisitos do cargo e à cultura da empresa.', options: ['SIM', 'NAO', 'TALVEZ'] },
      { key: 'q2', text: 'Tem o perfil comportamental conforme solicitado, e demonstra uma boa adaptação com o cargo e a cultura da empresa.', options: ['SIM', 'NAO'] },
      { key: 'q3', text: 'Tem-se esforçado para integrar-se à equipe, ao trabalho e à cultura da empresa.', options: ['SIM', 'NAO'] },
      { key: 'q4', text: 'Está completamente integrado à equipe, às atribuições do cargo e às normas e políticas da empresa.', options: ['SIM', 'NAO'] },
    ],
  },
  {
    key: 'interest',
    name: 'Interesse e Compromisso',
    gradedQuestion: 'Nível de entusiasmo demonstrado pelo trabalho que realiza.',
    subQuestions: [
      { key: 'q1', text: 'Demonstra total interesse pelo emprego e pelos seus resultados.', options: ['SIM', 'NAO'] },
      { key: 'q2', text: 'Demonstra interesse normal para um novo colaborador que está em fase de adaptação.', options: ['SIM', 'NAO'] },
      { key: 'q3', text: 'Não perde o estímulo com facilidade, não se faz necessário constantes doses de motivação.', options: ['SIM', 'NAO'] },
    ],
  },
  {
    key: 'relationship',
    name: 'Relacionamento Interpessoal',
    gradedQuestion: 'Capacidade de integrar-se ao novo grupo de trabalho.',
    subQuestions: [
      { key: 'q1', text: 'Integrou-se à equipe com muita facilidade, sem dificuldades.', options: ['SIM', 'NAO'] },
      { key: 'q2', text: 'Em pouco tempo tornou-se uma pessoa importantíssima para a equipe, está totalmente integrado.', options: ['SIM', 'NAO'] },
    ],
  },
  {
    key: 'learning',
    name: 'Capacidade de Aprendizagem',
    gradedQuestion: 'Facilidade de absorver novas informações e colocá-la na prática em suas novas atribuições.',
    subQuestions: [
      { key: 'q1', text: 'Demonstra muita habilidade nas atividades e executa suas atribuições sem falhas.', options: ['SIM', 'NAO', 'REGULAR'] },
      { key: 'q2', text: 'Parece aprender com facilidade suas novas tarefas.', options: ['SIM', 'NAO', 'REGULAR'] },
    ],
  },
];

export const CLASSIFICATION_OPTIONS = [
  { value: 'FRACO', label: 'Fraco, sem possibilidades futuras.' },
  { value: 'ALGUMAS_POSSIBILIDADES', label: 'Tem algumas possibilidades.' },
  { value: 'OTIMAS_PERSPECTIVAS', label: 'Possui ótimas perspectivas para o futuro.' },
  { value: 'EXCELENTE_AQUISICAO', label: 'É uma excelente aquisição para a empresa.' },
] as const;

export const CONCLUSION_OPTIONS = [
  { value: 'DEMITIR', label: 'Demitir.' },
  { value: 'EFETIVAR', label: 'Efetivar.' },
  { value: 'EXTENDER', label: '+ 45 dias em caráter experimental.' },
] as const;
