/**
 * Banco inicial de perguntas do Spot Integra.
 *
 * Consolidado a partir das 78 afirmações fornecidas pelo RH (ver item 63 do
 * briefing): perguntas que mediam praticamente a mesma coisa foram unificadas,
 * priorizando a versão mais clara/objetiva. Nenhuma dimensão foi removida.
 * Resultado: 73 perguntas (dentro da faixa de 60-75 solicitada), mais a de
 * eNPS (0 a 10) acrescentada em 10/2026 — 74 no total.
 *
 * Este arquivo é apenas o BANCO INICIAL usado pelo seed / "duplicar pesquisa".
 * Depois de criada, cada pesquisa tem suas próprias perguntas editáveis pelo
 * admin (adicionar, remover, reordenar, mudar dimensão/obrigatoriedade) — ver
 * item 8 do briefing.
 */

import { ENPS_DEFAULT_TEXT } from '../lib/enps';

export type QuestionType = 'LIKERT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_TEXT' | 'LONG_TEXT' | 'SCALE' | 'YES_NO';

export interface QuestionSeed {
  text: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  /** Pergunta de eNPS (src/lib/enps.ts): escala 0–10 que vira o eNPS nos resultados. */
  isEnps?: boolean;
}

export interface DimensionSeed {
  key: string;
  name: string;
  description: string;
  order: number;
  questions: QuestionSeed[];
}

/**
 * `usesColorCycle` marca os setores do projeto de cores (45/120/180 dias de
 * feedback) — hoje, os dois do Salão. É só o ponto de partida de um banco
 * novo: depois quem manda é o cadastro de Setores no painel do RH.
 */
export const SECTORS_SEED = [
  { name: 'Delivery', order: 1, usesColorCycle: false },
  { name: 'Salão - Bar', order: 2, usesColorCycle: true },
  { name: 'Salão - Atendimento', order: 3, usesColorCycle: true },
  { name: 'Administração', order: 4, usesColorCycle: false },
  { name: 'Cozinha', order: 5, usesColorCycle: false },
] as const;

export const UNITS_SEED = [
  { name: 'Salão JK', order: 1 },
  { name: 'Salão Paulista', order: 2 },
] as const;

const likert = (text: string, required = true): QuestionSeed => ({ text, type: 'LIKERT', required });

export const DIMENSIONS_SEED: DimensionSeed[] = [
  {
    key: 'lideranca',
    name: 'Liderança e Gestão',
    description: 'Percepção sobre orientação, feedback e apoio da liderança direta e da empresa.',
    order: 1,
    questions: [
      likert('Meu gestor e eu discutimos regularmente minhas metas e progresso de desenvolvimento.'),
      likert('Meu gestor me orienta e fornece feedback que me ajuda a ser eficaz no meu cargo atual.'),
      likert('Meu gestor me orienta e fornece feedback para que eu me prepare para cargos futuros.'),
      likert('Meu gestor me incentiva a assumir riscos inteligentes como parte do meu desenvolvimento.'),
      likert('Recebo orientação clara e apoio dos meus líderes para cumprir meus objetivos de trabalho.'),
      likert('Confio na liderança da empresa para guiá-la para o sucesso futuro.'),
      likert('Meu líder está disponível quando preciso de ajuda.'),
      likert('Recebo feedback oportuno sobre meu desempenho no trabalho.'),
      likert('Sinto que meu trabalho é valorizado e reconhecido pelo meu líder.'),
    ],
  },
  {
    key: 'desenvolvimento',
    name: 'Desenvolvimento e Carreira',
    description: 'Acesso a aprendizado, treinamento e oportunidades de crescimento profissional.',
    order: 2,
    questions: [
      likert('Tenho o tempo e o espaço necessários para aprender novas habilidades de forma eficaz.'),
      likert('Quando estou aprendendo novas habilidades, minha empresa e líderes são compreensivos, mesmo diante de erros.'),
      likert('Os processos e recursos necessários para meu desenvolvimento estão bem documentados e são de fácil acesso.'),
      likert('Aprendo e cresço com o apoio de colegas, líderes e mentores.'),
      likert('Tenho fácil acesso ao treinamento necessário para cumprir minhas responsabilidades com sucesso.'),
      likert('A empresa oferece programas de treinamento e desenvolvimento profissional.'),
      likert('Tenho oportunidades de crescimento profissional nesta empresa.'),
      likert('Todos os funcionários, independentemente de sua origem, têm as mesmas oportunidades de crescimento.'),
      {
        text: 'Que tipo de desenvolvimento profissional você gostaria de receber no futuro?',
        type: 'MULTIPLE_CHOICE',
        required: false,
        options: [
          'Treinamentos técnicos', 'Liderança e gestão', 'Comunicação', 'Atendimento ao cliente', 'Vendas',
          'Gastronomia e cozinha', 'Tecnologia', 'Inteligência emocional', 'Plano de carreira', 'Mentoria', 'Outro',
        ],
      },
      {
        text: 'Qual a probabilidade de você se candidatar a uma posição superior na empresa?',
        type: 'SINGLE_CHOICE',
        required: false,
        options: ['Muito baixa', 'Baixa', 'Neutra', 'Alta', 'Muito alta'],
      },
      {
        text: 'Já teve conversas sobre sua carreira com o RH ou seu líder direto?',
        type: 'SINGLE_CHOICE',
        required: false,
        options: ['Sim', 'Não', 'Não me lembro'],
      },
      {
        text: 'Gostaria de participar de programas de mentoria na empresa?',
        type: 'SINGLE_CHOICE',
        required: false,
        options: ['Sim', 'Talvez', 'Não'],
      },
      {
        text: 'Recebeu treinamentos ou capacitações no último ano que contribuíram para seu crescimento?',
        type: 'SINGLE_CHOICE',
        required: false,
        options: ['Sim', 'Não', 'Não me lembro'],
      },
    ],
  },
  {
    key: 'comunicacao',
    name: 'Comunicação',
    description: 'Clareza, transparência e eficácia da comunicação interna.',
    order: 3,
    questions: [
      likert('A cultura da empresa promove uma comunicação honesta e respeitosa.'),
      likert('As reuniões em que participo são claras, produtivas e têm um objetivo definido.'),
      likert('As ferramentas de comunicação interna são eficazes.'),
      likert('Minha equipe mantém uma comunicação aberta e frequente.'),
      likert('Compreendo bem os objetivos estratégicos da organização.'),
      likert('Sinto-me informado(a) sobre as decisões importantes que afetam a empresa.'),
      likert('A comunicação entre gestores e colaboradores é clara e transparente.'),
      likert('Tenho acesso a recursos para me manter atualizado(a) na minha área.'),
      {
        text: 'Quais canais de comunicação interna você utiliza com mais frequência para se manter informado(a)?',
        type: 'MULTIPLE_CHOICE',
        required: false,
        options: [
          'WhatsApp', 'Conversas presenciais', 'Líder direto', 'RH', 'E-mail', 'Murais/comunicados internos',
          'Convenia', 'Reuniões', 'Outro',
        ],
      },
    ],
  },
  {
    key: 'colaboracao',
    name: 'Colaboração e Inovação',
    description: 'Cooperação entre colegas e equipes, e espaço para propor novas ideias.',
    order: 4,
    questions: [
      likert('Sinto que meus colegas estão dispostos a ajudar e compartilhar conhecimentos.'),
      likert('A colaboração entre as equipes é fluida e eficaz.'),
      likert('Sinto-me incentivado(a) a propor soluções criativas no meu trabalho.'),
      likert('A empresa promove um ambiente que incentiva a inovação e novas ideias.'),
    ],
  },
  {
    key: 'reconhecimento',
    name: 'Reconhecimento e Justiça',
    description: 'Percepção de reconhecimento, justiça nas decisões e satisfação com papel e benefícios.',
    order: 5,
    questions: [
      likert('Sinto que meu trabalho é adequadamente reconhecido.'),
      likert('As decisões sobre promoções e aumentos salariais são tomadas de maneira transparente e justa.'),
      likert('Estou satisfeito com meu papel e responsabilidades dentro da empresa.'),
      likert('Estou satisfeito com os benefícios que recebo.'),
    ],
  },
  {
    key: 'bem-estar',
    name: 'Bem-estar',
    description: 'Saúde física e emocional, apoio da equipe e sustentabilidade do ritmo de trabalho.',
    order: 6,
    questions: [
      likert('Acredito que possuo as ferramentas de trabalho que contribuem para o meu bem-estar físico.'),
      likert('Se eu tiver um problema, há alguém da minha equipe de trabalho a quem posso pedir apoio.'),
      likert('Na minha equipe de trabalho tenho uma pessoa que se preocupa comigo como pessoa.'),
      likert('Sinto-me seguro e confortável no meu local de trabalho.'),
      likert('O ambiente de trabalho é positivo e motivador.'),
      likert('Meu trabalho me proporciona satisfação pessoal.'),
      likert('O ambiente de trabalho é colaborativo e promove relacionamentos positivos.'),
      likert('A empresa promove o bem-estar emocional e mental dos colaboradores.'),
      likert('Tenho tempo suficiente para descansar e me desconectar do trabalho.'),
      likert('Sinto que consigo equilibrar o trabalho com minha vida pessoal.'),
      likert('No geral, minha saúde mental está bem.'),
      {
        text: 'Como você avaliaria seu nível atual de estresse relacionado ao trabalho?',
        type: 'SINGLE_CHOICE',
        required: false,
        options: ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'],
      },
    ],
  },
  {
    key: 'flexibilidade',
    name: 'Flexibilidade e Equilíbrio',
    description: 'Adequação do modelo de trabalho às necessidades pessoais dos colaboradores.',
    order: 7,
    questions: [
      likert('Tenho as ferramentas e o suporte adequados para realizar meu trabalho de forma eficaz sob meu modelo de trabalho atual.'),
      likert('Meu modelo de trabalho atual permite alcançar um bom equilíbrio entre minha vida pessoal e profissional.'),
      likert('Estou satisfeito(a) com as opções de flexibilidade de trabalho que a empresa oferece atualmente.'),
      likert('Depois do trabalho, tenho tempo e energia para meus hobbies, família e amigos.'),
      likert('A empresa possui um modelo de trabalho que considera as necessidades dos colaboradores.'),
      {
        text: 'Qual é o principal benefício que você experimenta (ou buscaria) da flexibilidade de trabalho?',
        type: 'MULTIPLE_CHOICE',
        required: false,
        options: [
          'Melhor equilíbrio entre vida pessoal e profissional', 'Mais tempo com família',
          'Facilidade para resolver assuntos pessoais', 'Menor estresse', 'Maior produtividade',
          'Maior autonomia', 'Menor tempo de deslocamento', 'Outro',
        ],
      },
      {
        text: 'Qual seria o seu modelo de trabalho ideal para otimizar seu bem-estar e produtividade?',
        type: 'SINGLE_CHOICE',
        required: false,
        options: ['Presencial', 'Híbrido', 'Remoto', 'Flexibilidade de horários', 'Meu trabalho exige presença física', 'Outro'],
      },
    ],
  },
  {
    key: 'inclusao',
    name: 'Inclusão e Respeito',
    description: 'Percepção de inclusão, respeito às diferenças e equidade das políticas internas.',
    order: 8,
    questions: [
      likert('A empresa promove um ambiente inclusivo onde as diferenças individuais são valorizadas.'),
      likert('Posso expressar minhas opiniões e preocupações sem medo de represálias.'),
      likert('Sinto-me tratado(a) com respeito independentemente do meu gênero, idade, origem, religião, orientação ou situação pessoal.'),
      likert('As políticas da empresa são justas e equitativas para todos os funcionários.'),
      {
        text: 'Quais áreas você acredita que deveriam ser fortalecidas em relação à diversidade e inclusão?',
        type: 'MULTIPLE_CHOICE',
        required: false,
        options: [
          'Respeito entre colaboradores', 'Combate à discriminação', 'Igualdade de oportunidades',
          'Diversidade de gênero', 'Diversidade de idade', 'Diversidade cultural',
          'Inclusão de pessoas com deficiência', 'Treinamentos sobre diversidade',
          'Canais de denúncia e apoio', 'Nenhuma', 'Outra',
        ],
      },
      {
        text: 'Você já presenciou ou vivenciou alguma situação que considera discriminatória na empresa?',
        type: 'SINGLE_CHOICE',
        required: false,
        options: ['Sim', 'Não', 'Prefiro não responder'],
      },
      {
        text: 'Gostaria de compartilhar algo para melhorar a inclusão e o respeito no ambiente de trabalho?',
        type: 'LONG_TEXT',
        required: false,
      },
    ],
  },
  {
    key: 'experiencia',
    name: 'Experiência Geral',
    description: 'Percepção geral sobre trabalhar no Spot e intenção de permanência/recomendação.',
    order: 9,
    questions: [
      likert('Sinto-me alinhado com os valores da empresa.'),
      likert('Tenho uma percepção positiva sobre trabalhar no Spot.'),
      likert('Recomendaria o Spot como um bom lugar para trabalhar.'),
      // eNPS: o mesmo tema em 0–10, a escala que permite comparar com o mercado.
      { text: ENPS_DEFAULT_TEXT, type: 'SCALE', required: true, scaleMin: 0, scaleMax: 10, isEnps: true },
      likert('Pretendo continuar trabalhando na empresa.'),
      likert('Estou satisfeito com meu trabalho atual.'),
      {
        text: 'Quais sugestões você tem para melhorar o ambiente de trabalho?',
        type: 'LONG_TEXT',
        required: false,
      },
      {
        text: 'Existe algum problema importante que você acredita que a empresa deveria conhecer?',
        type: 'LONG_TEXT',
        required: false,
      },
      {
        text: 'Se você pudesse mudar uma coisa no Spot para melhorar a experiência dos colaboradores, o que mudaria?',
        type: 'LONG_TEXT',
        required: false,
      },
    ],
  },
];

export function totalQuestionCount(): number {
  return DIMENSIONS_SEED.reduce((acc, d) => acc + d.questions.length, 0);
}
