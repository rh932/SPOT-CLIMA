/**
 * Fixtures do laboratório de auditoria assíncrona (`/__audit`).
 *
 * NÃO faz parte do produto: só existe para reproduzir rede lenta, falha de API
 * e lista vazia sem depender do banco. A rota inteira responde 404 fora de
 * desenvolvimento — ver src/app/__audit/page.tsx.
 */

const hoje = new Date();
const emDias = (d: number) => new Date(hoje.getTime() + d * 86400000).toISOString();

const funcionario = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `func-${i}`,
  fullName: ['Ana Ribeiro', 'Bruno Martins', 'Carla Nogueira', 'Diego Salles', 'Elisa Prado'][i % 5],
  admissionDate: emDias(-40 - i * 3),
  roleDescription: ['Atendente', 'Cozinheiro', 'Garçom', 'Auxiliar', 'Caixa'][i % 5],
  shift: i % 2 === 0 ? 'DIA' : 'NOITE',
  status: 'AWAITING_PERIOD_1',
  period1DueDate: emDias(3 - i),
  period2DueDate: emDias(48 - i),
  currentColor: null,
  nextFeedbackDueDate: null,
  sector: { id: 's1', name: 'Salão', usesColorCycle: true },
  unit: { id: 'u1', name: 'Paulista' },
  evaluations: [],
  trainings: [],
  ...extra,
});

/**
 * Quadro de experiência com um caso de cada situação da consulta avançada:
 * pendente, atrasada, entregue fora do prazo, dois gestores no mesmo período,
 * prorrogado, efetivado, desligado com motivo, aprendiz. Nomes fictícios.
 */
const DIA_MS = 86400000;
const adm = (diasAtras: number) => new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12) - diasAtras * DIA_MS);
const iso = (d: Date) => d.toISOString();
const mais = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS);
const LOJAS_EXP = [{ id: 'u1', name: 'Praça Paulista' }, { id: 'u2', name: 'Praça JK' }];
const SETORES_EXP = [{ id: 's1', name: 'Salão' }, { id: 's2', name: 'Cozinha' }, { id: 's3', name: 'Delivery' }, { id: 's4', name: 'ADM' }];
const aval = (
  id: string, admissao: Date, period: 'FIRST' | 'SECOND', diasAposFim: number, conclusion: string,
  classification: string, evaluatorName: string, cycleNumber = 1,
) => {
  const fim = mais(admissao, period === 'FIRST' ? 44 : 89);
  return {
    id, period, cycleNumber, conclusion, classification,
    evaluationDate: iso(mais(fim, diasAposFim)), dueDateAtEvaluation: iso(fim),
    source: 'FORMS', evaluatorName, evaluator: null,
    flexibilityRating: 'BOM', interestRating: 'OTIMO', relationshipRating: 'BOM', learningRating: 'REGULAR',
  };
};
const exp = (i: number, nome: string, cargo: string, diasAtras: number, extra: Record<string, unknown> = {}) => {
  const a = adm(diasAtras);
  return funcionario(i, {
    id: 'exp-' + i, fullName: nome, roleDescription: cargo, admissionDate: iso(a),
    period1DueDate: iso(mais(a, 44)), period2DueDate: iso(mais(a, 89)),
    unit: LOJAS_EXP[i % 2], sector: SETORES_EXP[i % 4], isApprentice: false,
    terminationReason: null, terminationDate: null, terminationNotes: null, ...extra,
  });
};
const EXPERIENCIA = [
  exp(0, 'Marina Couto Alves', 'GARÇONETE', 20),
  exp(1, 'Otávio Lins Barreto', 'AUXILIAR DE SERVIÇOS III', 50),
  exp(2, 'Paula Reis Andrade', 'OPERADOR(A) DE CAIXA', 40),
  exp(3, 'Renato Siqueira Dutra', 'GARÇOM', 70, { status: 'AWAITING_PERIOD_2', evaluations: [aval('v1', adm(70), 'FIRST', -3, 'EXTENDER', 'ALGUMAS_POSSIBILIDADES', 'GESTOR SALÃO A')] }),
  exp(4, 'Sofia Brandão Leite', 'GARÇONETE', 95, { status: 'AWAITING_PERIOD_2', evaluations: [aval('v2', adm(95), 'FIRST', 4, 'EXTENDER', 'OTIMAS_PERSPECTIVAS', 'GESTOR SALÃO B')] }),
  exp(5, 'Tiago Moura Falcão', 'COPEIRO II', 120, { status: 'HIRED', evaluations: [
    aval('v3', adm(120), 'FIRST', -2, 'EXTENDER', 'OTIMAS_PERSPECTIVAS', 'GESTOR COZINHA A'),
    aval('v4', adm(120), 'SECOND', -1, 'EFETIVAR', 'EXCELENTE_AQUISICAO', 'GESTOR COZINHA A'),
  ] }),
  exp(6, 'Úrsula Pinheiro Neves', 'GARÇONETE', 110, {
    status: 'TERMINATED', terminationReason: 'DISPENSA_EXPERIENCIA', terminationDate: iso(adm(20)), terminationNotes: 'Demissão no contrato de experiência',
    evaluations: [
      aval('v5', adm(110), 'FIRST', -4, 'EFETIVAR', 'ALGUMAS_POSSIBILIDADES', 'GESTOR SALÃO A'),
      aval('v6', adm(110), 'FIRST', -1, 'EXTENDER', 'ALGUMAS_POSSIBILIDADES', 'GESTOR SALÃO B', 2),
      aval('v7', adm(110), 'SECOND', -3, 'DEMITIR', 'FRACO', 'GESTOR SALÃO B'),
    ],
  }),
  exp(7, 'Vítor Carvalho Rangel', 'AUXILIAR DE SERVIÇOS III', 30, { status: 'TERMINATED', terminationReason: 'ABANDONO_EMPREGO', terminationDate: iso(adm(5)), terminationNotes: 'Demissão por justa causa - abandono de emprego' }),
  exp(8, 'Wagner Toledo Assis', 'APRENDIZ DE COZINHA', 60, { status: 'HIRED', isApprentice: true }),
  exp(9, 'Yara Monteiro Sales', 'GARÇONETE', 60, { status: 'HIRED', evaluations: [aval('v8', adm(60), 'FIRST', 6, 'EFETIVAR', 'EXCELENTE_AQUISICAO', 'GESTOR SALÃO A')] }),
  exp(10, 'Zeca Albuquerque Lima', 'GARÇOM', 40, { status: 'TERMINATED', terminationReason: 'PEDIDO_DEMISSAO', terminationDate: iso(adm(10)), terminationNotes: 'Pedido de demissão - aviso prévio não trabalhado' }),
  exp(11, 'Alice Fontes Queiroz', 'OFICIAL DE MANUTENÇÃO', 80, { status: 'AWAITING_PERIOD_2', evaluations: [aval('v9', adm(80), 'FIRST', 0, 'EXTENDER', 'OTIMAS_PERSPECTIVAS', 'GESTOR ADM')] }),
];

/**
 * Resultado de pesquisa com números plausíveis (não redondos): serve para
 * conferir o painel do RH sem banco, e para ver como as faixas de cor do mapa
 * de calor se comportam — há uma dimensão em cada faixa, de Excelente a Muito
 * crítico, e uma célula oculta por anonimato.
 */
const DIMENSOES = [
  ['d1', 'Reconhecimento', 88.4],
  ['d2', 'Liderança', 79.1],
  ['d3', 'Comunicação', 71.6],
  ['d4', 'Carga de trabalho', 58.3],
  ['d5', 'Remuneração', 43.9],
] as const;

const classificar = (i: number) =>
  i >= 85 ? { label: 'Excelente', colorToken: 'excellent' }
  : i >= 75 ? { label: 'Bom', colorToken: 'good' }
  : i >= 65 ? { label: 'Atenção', colorToken: 'attention' }
  : i >= 50 ? { label: 'Crítico', colorToken: 'critical' }
  : { label: 'Muito crítico', colorToken: 'very-critical' };

const SETORES = [['s1', 'Salão'], ['s2', 'Cozinha'], ['s3', 'Bar']] as const;

// Mesmo formato que o servidor devolve (src/lib/results.ts): números só de
// pesquisa encerrada, sem contagem em grupo oculto.
const RESULTADOS = {
  surveyId: 'p1',
  surveyName: 'Clima 2026 · 1º semestre',
  status: 'CLOSED',
  locked: null,
  lockedReason: null,
  excludedQuestions: 1,
  totalResponses: 48,
  eligiblePopulation: 77,
  participationRate: 62.3,
  participationClassification: 'Moderada',
  climateIndex: 73.2,
  climateClassification: classificar(73.2),
  standardDeviation: 1.1,
  favorability: { favorable: 61.4, neutral: 22.8, unfavorable: 15.8 },
  byDimension: DIMENSOES.map(([id, nome, idx], i) => ({
    dimensionId: id,
    dimension: nome,
    average: Number((idx / 20).toFixed(2)),
    index: idx,
    favorable: Number((idx - 6).toFixed(1)),
    neutral: 20.5,
    unfavorable: Number((100 - idx - 14).toFixed(1)),
    responseCount: 48 - i,
    classification: classificar(idx),
  })),
  bySector: SETORES.map(([id, nome], i) => ({
    sectorId: id,
    sector: nome,
    responseCount: [21, 18, 9][i],
    visible: true,
    hiddenReason: null,
    average: [3.8, 3.5, 4.1][i],
    index: [75.4, 68.2, 81.7][i],
    favorable: [66.1, 57.3, 72.9][i],
    neutral: [21.2, 25.4, 18.1][i],
    unfavorable: [12.7, 17.3, 9.0][i],
    participationRate: [64.2, 58.9, 70.1][i],
  })),
  // Uma célula por setor × dimensão. A do Bar em Remuneração fica oculta:
  // é o caso que o painel precisa saber desenhar (regra de anonimato).
  heatmap: SETORES.flatMap(([sid, snome], si) =>
    DIMENSOES.map(([did, dnome, idx], di) => {
      const oculta = si === 2 && di === 4;
      return {
        sectorId: sid,
        sector: snome,
        dimensionId: did,
        dimension: dnome,
        index: oculta ? null : Math.round(idx + (si - 1) * 6 - di),
        visible: !oculta,
        responseCount: oculta ? null : 9 + si * 4,
      };
    }),
  ),
  byUnit: [{
    unitId: 'u1', unit: 'Paulista', responseCount: 48, visible: true, hiddenReason: null,
    average: 3.7, index: 73.2, favorable: 61.4, neutral: 22.8, unfavorable: 15.8, participationRate: 62.3,
  }],
  unitHeatmap: DIMENSOES.map(([did, dnome, idx]) => ({
    unitId: 'u1', unit: 'Paulista', dimensionId: did, dimension: dnome,
    index: Math.round(idx), visible: true, responseCount: 48,
  })),
  topStrengths: [
    { questionId: 'q1', text: 'Sei o que se espera de mim no meu turno.', dimension: 'Comunicação', favorable: 91.7, responseCount: 48 },
    { questionId: 'q2', text: 'Me sinto respeitado pelos colegas.', dimension: 'Reconhecimento', favorable: 87.5, responseCount: 48 },
  ],
  topCritical: [
    { questionId: 'q3', text: 'Considero meu salário justo para a função.', dimension: 'Remuneração', favorable: 31.3, responseCount: 48 },
    { questionId: 'q4', text: 'Consigo dar conta do volume de trabalho.', dimension: 'Carga de trabalho', favorable: 45.8, responseCount: 48 },
  ],
  recommendations: [
    {
      dimension: 'Remuneração',
      index: 43.9,
      suggestions: [
        'Revisar a política de reajuste do salão com o financeiro.',
        'Abrir a régua de faixas salariais por função.',
      ],
    },
    {
      dimension: 'Carga de trabalho',
      index: 58.3,
      suggestions: ['Rever a escala do turno noturno da cozinha.'],
    },
  ],
  insights: [
    'A participação de 62,3% é a mais baixa dos últimos três ciclos.',
    'Remuneração aparece em último por dois ciclos seguidos.',
    'O Bar é o único setor acima de 80 em todas as dimensões visíveis.',
  ],
  anonymityThreshold: 5,
};

/**
 * Ficha completa de um colaborador. Duas rotas apontam para ela: a ficha usa o
 * id que a bancada passa em params (`func-0`) e a tela de avaliação lê o id
 * pela rota real, que na bancada não existe e chega como `undefined`.
 */
// Usuários fictícios da aba Usuários: pendentes do 1º login, quem já entrou e um RH.
const escopo = (loja: number, setor: number, turnos: ('DIA' | 'NOITE')[]) => ({
  scopedUnits: [LOJAS_EXP[loja]], scopedSectors: [SETORES_EXP[setor]], scopedShifts: turnos,
});
const USUARIOS = [
  { id: 'ad-1', name: 'Marcos Pereira Lima', email: 'marcos.pereira@spot.com', role: 'GESTOR', active: true, ...escopo(0, 0, ['DIA']), firstLoginAt: null, lastLoginAt: null },
  { id: 'ad-2', name: 'Carla Souza Nunes', email: 'carla.souza@spot.com', role: 'GESTOR', active: true, ...escopo(1, 1, ['NOITE']), firstLoginAt: emDias(-9), lastLoginAt: emDias(-1) },
  { id: 'ad-3', name: 'Rafael Dias Costa', email: 'rafael.dias@spot.com', role: 'GESTOR_LIDER', active: true, scopedUnits: LOJAS_EXP, scopedSectors: SETORES_EXP.slice(0, 2), scopedShifts: ['DIA', 'NOITE'], firstLoginAt: null, lastLoginAt: null },
  { id: 'ad-4', name: 'Equipe RH', email: 'rh@exemplo.com', role: 'SUPER_ADMIN', active: true, scopedUnits: [], scopedSectors: [], scopedShifts: [], firstLoginAt: emDias(-200), lastLoginAt: emDias(0) },
];

const FICHA_COLABORADOR = {
  employee: {
    id: 'func-0',
    fullName: 'Ana Ribeiro',
    admissionDate: emDias(-40),
    roleDescription: 'Atendente',
    shift: 'DIA',
    status: 'AWAITING_PERIOD_1',
    period1DueDate: emDias(3),
    period2DueDate: emDias(48),
    currentColor: null,
    nextFeedbackDueDate: null,
    sector: { id: 's1', name: 'Salão', usesColorCycle: true },
    unit: { id: 'u1', name: 'Paulista' },
  },
  // A linha do tempo é metade da ficha; sem eventos ela não mostra o que veio
  // mostrar.
  evaluations: [{
    id: 'av-1',
    period: 'FIRST',
    cycleNumber: 1,
    evaluationDate: emDias(-12),
    classification: 'ALGUMAS_POSSIBILIDADES',
    conclusion: 'EXTENDER',
    color: null,
    evaluator: { name: 'João (gestor do salão)' },
  }],
  colorChanges: [{
    id: 'c-1',
    createdAt: emDias(-10),
    previousColor: null,
    newColor: 'AMARELO',
    reason: 'Primeira classificação após o ciclo inicial.',
    evaluationId: null,
    changedBy: { name: 'João (gestor do salão)' },
  }],
  trainings: [{
    id: 't-1',
    trainingDate: emDias(-20),
    result: 'APROVADO_COM_RESSALVA',
    closure: 'DEFINITIVO',
    needsReinforcement: true,
    trainingType: { name: 'Atendimento ao cliente' },
    trainer: { name: 'Marina (treinadora)' },
  }],
  canEvaluate: true,
  canChangeColor: true,
  canDelete: false,
  // Setor com dois gestores: o outro já respondeu o 1º período.
  secondOpinion: {
    period: 'FIRST',
    until: emDias(18),
    firstEvaluator: 'João (gestor do salão)',
    firstConclusion: 'EXTENDER',
    firstDate: emDias(-12),
  },
};

/** Análise de comentários — vem na MESMA rota dos resultados. */
const COMENTARIOS = {
  locked: null,
  lockedReason: null,
  totalComments: 31,
  commentRespondents: 27,
  verbatimHidden: false,
  anonymityThreshold: 5,
  byTheme: [
    { theme: 'Remuneração', count: 11 },
    { theme: 'Escala e folga', count: 8 },
    { theme: 'Liderança', count: 6 },
    { theme: 'Estrutura', count: 4 },
    { theme: 'Outros', count: 2 },
  ],
  bySentiment: [
    { sentiment: 'Positivo', count: 12 },
    { sentiment: 'Neutro', count: 9 },
    { sentiment: 'Negativo', count: 10 },
  ],
  examples: {
    elogios: [
      'A equipe do salão se ajuda muito quando aperta.',
      'O treinamento de entrada me deixou seguro no primeiro dia.',
    ],
    reclamacoes: [
      'A escala do noturno muda em cima da hora.',
      'O reajuste demorou mais do que tinham falado.',
    ],
    sugestoes: [
      'Ter um mural com a escala fixada com uma semana de antecedência.',
    ],
  },
  wordCloud: [
    { word: 'escala', count: 14 }, { word: 'salário', count: 12 },
    { word: 'equipe', count: 9 }, { word: 'folga', count: 7 },
    { word: 'treinamento', count: 6 }, { word: 'liderança', count: 5 },
    { word: 'cozinha', count: 4 }, { word: 'salão', count: 4 },
  ],
};

const haMin = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** Caixa do sino: movimentações recentes (não lidas no topo) e um lembrete de prazo. */
const CAIXA_AVISOS = {
  unread: 2,
  notifications: [
    { id: 'n1', type: 'EVALUATION_SUBMITTED', message: 'Carlos Lima registrou a avaliação de 45 dias de Heloisa Mendonça.', dueDate: null, offsetDays: null, readAt: null, createdAt: haMin(4), employee: { id: 'func-0', fullName: 'Heloisa Mendonça' }, actor: { name: 'Carlos Lima' } },
    { id: 'n2', type: 'EVALUATION_REMINDER', message: 'Atrasada: a avaliação de 90 dias de Rafael Souza venceu ontem e ainda não foi registrada.', dueDate: emDias(-1), offsetDays: -1, readAt: null, createdAt: haMin(90), employee: { id: 'func-1', fullName: 'Rafael Souza' }, actor: null },
    { id: 'n3', type: 'TRAINING_CREATED', message: 'Ana Paula registrou o treinamento "Atendimento ao cliente" de Bruno Alves.', dueDate: null, offsetDays: null, readAt: haMin(60), createdAt: haMin(60 * 26), employee: { id: 'func-2', fullName: 'Bruno Alves' }, actor: { name: 'Ana Paula' } },
    { id: 'n4', type: 'TRAINING_TYPE_CREATED', message: 'Novo formulário de treinamento disponível: "Avaliações do Bar".', dueDate: null, offsetDays: null, readAt: haMin(60), createdAt: haMin(60 * 24 * 3), employee: null, actor: { name: 'RH' } },
  ],
};

export const FIXTURES: Record<string, unknown> = {
  '/api/gestor/notifications': CAIXA_AVISOS,
  '/api/admin/notifications': {
    ...CAIXA_AVISOS,
    items: [0, 1].map((i) => ({ ...funcionario(i), currentColor: 'AMARELO', nextFeedbackDueDate: emDias(i * 3 - 1), dias: i * 3 - 1, status: null, sector: { name: 'Salão' }, unit: { name: 'Paulista' } })),
    atrasados: 1,
    total: 2,
  },
  '/api/gestor/push': { enabled: true, publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', devices: 0 },
  '/api/admin/push': { enabled: true, publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', devices: 0 },
  '/api/public/surveys': { surveys: [{ id: 'pesq-1', name: 'Clima 2026 - 1o semestre', description: 'Leva poucos minutos.' }] },
  '/api/gestor/me': {
    role: 'GESTOR',
    permissions: ['evaluations.view', 'evaluations.history.view', 'trainings.view', 'trainings.history.view', 'notifications.receive'],
  },
  '/api/auth/me': { admin: { name: 'Auditoria' } },
  '/api/gestor/employees': { employees: [0, 1, 2, 3].map((i) => funcionario(i)), canEvaluate: true },
  '/api/gestor/training-types': {
    trainingTypes: [{
      id: 't1', name: 'Atendimento ao cliente', description: 'Padrão de atendimento do salão.',
      criteria: [
        { id: 'c1', label: 'Abordagem', hint: 'Cumprimenta e se apresenta', order: 1, active: true },
        { id: 'c2', label: 'Sugestão de venda', hint: null, order: 2, active: true },
      ],
      ratingOptions: null, contextFields: null, positiveLabel: null, negativeLabel: null, materials: [],
    }],
  },
  '/api/gestor/lookups': { sectors: [{ id: 's1', name: 'Salão' }], units: [{ id: 'u1', name: 'Paulista' }], shifts: ['DIA', 'NOITE'] },
  '/api/admin/employees': { employees: EXPERIENCIA },
  '/api/admin/sectors': { sectors: SETORES_EXP.map((x, i) => ({ ...x, active: true, order: i + 1, usesColorCycle: x.id === 's1', inSurvey: true, inEvaluation: true })) },
  '/api/admin/units': { units: LOJAS_EXP.map((x, i) => ({ ...x, active: true, order: i + 1 })) },
  '/api/admin/admins': { admins: USUARIOS },
  // A tela de avaliacao le useParams().id, que fora de uma rota dinamica vem
  // undefined — a bancada responde na URL que ela realmente chama.
  '/api/gestor/employees/func-0': FICHA_COLABORADOR,
  '/api/gestor/employees/undefined': FICHA_COLABORADOR,
  '/api/admin/surveys': {
    surveys: [
      { id: 'p1', name: 'Clima 2026 · 1º semestre', status: 'OPEN', openDate: emDias(-20), closeDate: emDias(10), createdAt: emDias(-20) },
      { id: 'p2', name: 'Clima 2025 · 2º semestre', status: 'CLOSED', openDate: emDias(-210), closeDate: emDias(-180), createdAt: emDias(-200) },
    ],
  },
  '/api/admin/surveys/active': {
    survey: { id: 'p1', name: 'Clima 2026 · 1º semestre', status: 'OPEN', openDate: emDias(-20), closeDate: emDias(10) },
  },
  // Pesquisa aberta: o servidor só devolve a participação (ataque por diferença).
  '/api/admin/surveys/p1/results': {
    results: {
      ...RESULTADOS, status: 'OPEN', locked: 'SURVEY_OPEN', excludedQuestions: 0,
      lockedReason: 'Os resultados ficam disponíveis quando a pesquisa for encerrada. Com ela aberta, comparar o painel antes e depois de alguém responder revelaria a resposta daquela pessoa.',
      climateIndex: 0, byDimension: [], bySector: [], heatmap: [], byUnit: [], unitHeatmap: [],
      topStrengths: [], topCritical: [], recommendations: [], insights: [],
    },
    comments: {
      ...COMENTARIOS, locked: 'SURVEY_OPEN', totalComments: 0, commentRespondents: 0, byTheme: [], bySentiment: [],
      examples: { elogios: [], reclamacoes: [], sugestoes: [] }, wordCloud: [],
      lockedReason: 'Os resultados ficam disponíveis quando a pesquisa for encerrada. Com ela aberta, comparar o painel antes e depois de alguém responder revelaria a resposta daquela pessoa.',
    },
  },
  '/api/admin/surveys/p2/results': { results: { ...RESULTADOS, surveyId: 'p2', surveyName: 'Clima 2025 · 2º semestre', status: 'CLOSED' }, comments: COMENTARIOS },
  '/api/admin/template-categories': {
    categories: [
      { id: 'cat-1', name: 'Clima organizacional', active: true },
      { id: 'cat-2', name: 'Onboarding', active: true },
    ],
  },
  '/api/admin/templates': {
    templates: [
      { id: 'mod-1', name: 'Clima completo (35 perguntas)', description: 'Modelo padrão do ciclo semestral.', categoryId: 'cat-1', category: { id: 'cat-1', name: 'Clima organizacional', active: true }, active: true, questionCount: 35 },
      { id: 'mod-2', name: 'Pulso rápido (8 perguntas)', description: 'Checagem curta entre ciclos.', categoryId: 'cat-1', category: { id: 'cat-1', name: 'Clima organizacional', active: true }, active: true, questionCount: 8 },
      { id: 'mod-3', name: 'Primeiros 30 dias', description: null, categoryId: 'cat-2', category: { id: 'cat-2', name: 'Onboarding', active: true }, active: false, questionCount: 12 },
    ],
  },
  '/api/admin/dimensions': {
    dimensions: DIMENSOES.map(([id, nome], i) => ({ id, name: nome, order: i + 1, active: true, questionCount: 4 })),
  },
  '/api/admin/action-plans': {
    actionPlans: [
      { id: 'a1', problem: 'Escala do noturno sobrecarrega a cozinha', priority: 'CRITICAL', owner: 'Coordenação', status: 'IN_PROGRESS', dueDate: emDias(12), notes: 'Piloto começa no próximo ciclo.' },
      { id: 'a2', problem: 'Reajuste do salão', priority: 'HIGH', owner: 'RH', status: 'NOT_STARTED', dueDate: emDias(30), notes: null },
      { id: 'a3', problem: 'Mural de comunicados sem uso', priority: 'LOW', owner: 'Salão', status: 'DONE', dueDate: emDias(-5), notes: null },
    ],
  },
};

export const PERGUNTAS_PESQUISA = [
  { id: 'p-likert', text: 'Sinto que meu trabalho e reconhecido pela lideranca.', type: 'LIKERT' as const, required: true, options: [], dimension: { id: 'd1', name: 'Reconhecimento', order: 1 } },
  { id: 'p-escala', text: 'De 0 a 10, o quanto voce recomendaria o Spot como lugar para trabalhar?', type: 'SCALE' as const, required: true, options: [], scaleMin: 0, scaleMax: 10, dimension: { id: 'd1', name: 'Reconhecimento', order: 1 } },
  { id: 'p-simnao', text: 'Voce recebeu treinamento ao entrar?', type: 'YES_NO' as const, required: true, options: [], dimension: { id: 'd1', name: 'Reconhecimento', order: 1 } },
  { id: 'p-texto', text: 'O que voce mudaria no dia a dia do restaurante?', type: 'LONG_TEXT' as const, required: false, options: [], dimension: { id: 'd1', name: 'Reconhecimento', order: 1 } },
];

export const VAZIO: Record<string, unknown> = {
  ...FIXTURES,
  '/api/gestor/employees': { employees: [], canEvaluate: true },
  '/api/admin/employees': { employees: [] },
  '/api/admin/surveys': { surveys: [] },
};

/** Perguntas para auditar o editor de lista (botoes de reordenar/editar/remover). */
export const PERGUNTAS_EXEMPLO = [
  {
    id: 'q1', order: 1, dimensionId: 'd1', text: 'Sinto que meu trabalho e reconhecido pela lideranca.',
    type: 'SCALE' as const, required: true, options: [], scaleMin: 1, scaleMax: 5,
    dimension: { id: 'd1', name: 'Reconhecimento', order: 1, description: null, active: true },
  },
  {
    id: 'q2', order: 2, dimensionId: 'd2', text: 'Recebo as informacoes de que preciso para fazer meu trabalho.',
    type: 'SCALE' as const, required: true, options: [], scaleMin: 1, scaleMax: 5,
    dimension: { id: 'd2', name: 'Comunicacao', order: 2, description: null, active: true },
  },
  {
    id: 'q3', order: 3, dimensionId: null, text: 'O que voce mudaria no dia a dia do restaurante?',
    type: 'TEXT' as const, required: false, options: [], scaleMin: null, scaleMax: null,
    dimension: null,
  },
];
