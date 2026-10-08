import { z } from 'zod';
import { TERMINATION_REASONS } from './termination';
import { saoPauloDay } from './probation';
import { MIN_ANONYMITY_THRESHOLD, MAX_ANONYMITY_THRESHOLD } from './anonymity';

/** Id gerado pelo sistema (cuid2). Teto de tamanho para nada arbitrário chegar ao banco. */
const idSchema = z.string().min(1).max(64);
/** RFC 5321: um endereço tem no máximo 254 caracteres. */
const emailSchema = z.string().trim().email().max(254);

/**
 * Senha de conta do sistema. 8 a 128 caracteres (o bcrypt ignora o que passa
 * de 72 bytes, e um teto evita hash de corpo gigante) e nada de sequência
 * óbvia ou do mesmo caractere repetido.
 */
export const accountPasswordSchema = z.string()
  .min(8, 'A senha precisa ter ao menos 8 caracteres.')
  .max(128, 'Use no máximo 128 caracteres.')
  .refine((p) => new Set(p).size >= 4, 'Use ao menos 4 caracteres diferentes.')
  .refine((p) => !/^(?:12345678|password|senha123|qwerty)/i.test(p), 'Senha óbvia demais.');

export const loginSchema = z.object({
  email: emailSchema,
  // Teto: o bcrypt só olha os primeiros 72 bytes, e um corpo enorme custaria
  // CPU à toa no hash.
  password: z.string().min(6).max(128),
  portal: z.enum(['admin', 'gestor']),
});

/** Código da verificação em duas etapas: 6 dígitos do app ou XXXX-XXXX de recuperação. */
export const mfaCodeSchema = z.object({
  code: z.string().trim().min(6).max(20),
});

/** Desligar a verificação em duas etapas pede a senha e um código válido. */
export const mfaDisableSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().trim().min(6).max(20),
});

/** Primeiro acesso: sem `password` só confere o código (para a tela cumprimentar pelo nome). */
export const firstAccessSchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(4).max(20),
  password: accountPasswordSchema.optional(),
});

export const sectorSchema = z.object({
  name: z.string().min(2).max(80),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
  /** Participa do ciclo de cores (45/120/180) — ver sectors.usesColorCycle. */
  usesColorCycle: z.boolean().optional(),
  /** Onde o setor aparece — ver sectors.inSurvey / sectors.inEvaluation. */
  inSurvey: z.boolean().optional(),
  inEvaluation: z.boolean().optional(),
  /** Participa do módulo de treinamento (Salão) — ver sectors.inTraining. */
  inTraining: z.boolean().optional(),
});

export const unitSchema = z.object({
  name: z.string().min(2).max(80),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const dimensionSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const questionTypeSchema = z.enum([
  'LIKERT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT', 'LONG_TEXT', 'SCALE', 'YES_NO',
]);

export const questionOptionSchema = z.object({
  label: z.string().min(1).max(200),
  order: z.number().int().optional(),
});

// Base sem .refine() — usada com .partial() nas rotas PATCH (refine() não é
// compatível com .partial(), já que produz um ZodEffects em vez de ZodObject).
export const questionBaseSchema = z.object({
  dimensionId: z.string().nullable().optional(),
  text: z.string().min(3).max(600),
  type: questionTypeSchema,
  required: z.boolean().optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
  options: z.array(questionOptionSchema).optional(),
  scaleMin: z.number().int().optional().nullable(),
  scaleMax: z.number().int().optional().nullable(),
});

function scaleRefinement(data: { type: string; scaleMin?: number | null; scaleMax?: number | null }): boolean {
  return data.type !== 'SCALE' || (data.scaleMin != null && data.scaleMax != null && data.scaleMin < data.scaleMax);
}
const scaleRefinementOptions: { message: string; path: string[] } = {
  message: 'Perguntas do tipo Escala precisam de um mínimo e máximo válidos (mínimo menor que máximo).',
  path: ['scaleMin'],
};

export const questionSchema = questionBaseSchema.refine(scaleRefinement, scaleRefinementOptions);

// Mesmo shape de questionSchema, usado por perguntas de modelo (template_questions).
export const templateQuestionBaseSchema = z.object({
  dimensionId: z.string().nullable().optional(),
  text: z.string().min(3).max(600),
  type: questionTypeSchema,
  required: z.boolean().optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
  options: z.array(questionOptionSchema).optional(),
  scaleMin: z.number().int().optional().nullable(),
  scaleMax: z.number().int().optional().nullable(),
});

export const templateQuestionSchema = templateQuestionBaseSchema.refine(scaleRefinement, scaleRefinementOptions);

export const templateCategorySchema = z.object({
  name: z.string().min(2).max(80),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const questionTemplateSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(1000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export const surveySchema = z.object({
  name: z.string().min(3).max(160),
  description: z.string().max(1000).optional().nullable(),
  openDate: z.string().datetime().optional().nullable(),
  closeDate: z.string().datetime().optional().nullable(),
  eligiblePopulation: z.number().int().positive().optional().nullable(),
  // Piso fixo: quem lê os resultados não escolhe um limite que exponha alguém.
  anonymityThreshold: z.number().int().min(MIN_ANONYMITY_THRESHOLD).max(MAX_ANONYMITY_THRESHOLD).optional(),
});

/** Nova pesquisa a partir de um modelo: o corpo era gravado sem nenhuma validação. */
export const surveyFromTemplateSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  description: z.string().max(1000).optional().nullable(),
  eligiblePopulation: z.number().int().positive().optional().nullable(),
  anonymityThreshold: z.number().int().min(MIN_ANONYMITY_THRESHOLD).max(MAX_ANONYMITY_THRESHOLD).optional(),
});

/** Duplicar pesquisa ou modelo: só o nome novo, opcional. */
export const duplicateSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
});

/**
 * Confirmação da importação de perguntas. O preview já valida a planilha, mas
 * o confirm recebe as linhas de volta do navegador — e o navegador não é
 * confiável. Mesmos limites do cadastro manual de pergunta.
 */
export const importRowsSchema = z.object({
  rows: z.array(z.object({
    row: z.number().int().optional(),
    categoria: z.string().trim().min(2).max(120).optional(),
    text: z.string().trim().min(3).max(600),
    type: z.enum(['LIKERT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT', 'LONG_TEXT', 'SCALE', 'YES_NO']),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  }).refine(
    (r) => (r.type !== 'SINGLE_CHOICE' && r.type !== 'MULTIPLE_CHOICE') || new Set(r.options ?? []).size >= 2,
    { message: 'Perguntas de escolha precisam de ao menos duas opções diferentes.' },
  )).min(1).max(300),
});

export const surveyStatusSchema = z.enum(['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED']);

// Resposta do colaborador: valida o payload completo antes de gravar.
// numericValue não tem faixa fixa aqui porque a faixa válida depende do tipo
// da pergunta (LIKERT é sempre 1-5; SCALE varia por pergunta via scaleMin/scaleMax)
// — essa validação é feita em src/app/api/public/responses/route.ts, que já
// carrega a pergunta correspondente para checar tipo/obrigatoriedade.
export const answerSubmissionSchema = z.object({
  questionId: idSchema,
  numericValue: z.number().int().optional(),
  textValue: z.string().max(5000).optional(),
  choiceValues: z.array(z.string().max(200)).max(20).optional(),
});

export const surveySubmissionSchema = z.object({
  surveyId: idSchema,
  sectorId: idSchema,
  unitId: idSchema,
  answers: z.array(answerSubmissionSchema).min(1).max(300),
  /** Código de participação de uso único — só exigido quando a pesquisa pede (surveys.requireAccessCode). */
  accessCode: z.string().trim().max(20).optional(),
});

/** Geração de códigos de participação: um lote por vez, com teto para não travar a impressão. */
export const accessCodesGenerateSchema = z.object({
  quantity: z.number().int().min(1).max(500),
});

export const accessCodesToggleSchema = z.object({
  requireAccessCode: z.boolean(),
});

export const actionPlanSchema = z.object({
  surveyId: z.string().optional().nullable(),
  problem: z.string().min(3).max(500),
  dimensionId: z.string().optional().nullable(),
  sectorId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  action: z.string().min(3).max(1000),
  owner: z.string().min(2).max(160),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const systemSettingSchema = z.object({
  key: z.string().regex(/^[a-z0-9_.-]{1,64}$/i, 'Chave inválida.'),
  // Valor livre (JSON), mas com teto: nada lê esta tabela hoje, e sem limite
  // ela virava depósito de qualquer coisa.
  value: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 10_000, 'Valor grande demais.'),
});

// ------------------------------------------------------------------
// Administradores (inclui escopo de Gestor: unidade + setor específicos)
// ------------------------------------------------------------------

const adminScopeFields = {
  scopedUnitIds: z.array(idSchema).max(100).optional(),
  scopedSectorIds: z.array(idSchema).max(100).optional(),
  scopedShifts: z.array(z.enum(['DIA', 'NOITE'])).max(2).optional(),
};



export const createAdminSchema = z.object({
  name: z.string().min(2).max(160),
  email: emailSchema,
  password: accountPasswordSchema,
  role: z.enum(['SUPER_ADMIN', 'RH', 'GESTOR', 'GESTOR_LIDER', 'TREINADOR']),
  ...adminScopeFields,
}).refine(
  // Gestor, Líder e Treinador operam por recorte (unidade + setor + turno).
  // Papéis administrativos enxergam tudo e não têm escopo.
  (d) => !['GESTOR', 'GESTOR_LIDER', 'TREINADOR'].includes(d.role)
    || ((d.scopedUnitIds?.length ?? 0) > 0 && (d.scopedSectorIds?.length ?? 0) > 0 && (d.scopedShifts?.length ?? 0) > 0),
  { message: 'Selecione ao menos uma unidade, um setor e um turno.', path: ['scopedUnitIds'] },
);

// Sem .refine() (não compõe com atualizações parciais) — a regra "GESTOR
// precisa de escopo" é aplicada no handler do PATCH, sobre a linha já mesclada.
export const updateAdminSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  email: emailSchema.optional(),
  password: accountPasswordSchema.optional(),
  role: z.enum(['SUPER_ADMIN', 'RH', 'GESTOR', 'GESTOR_LIDER', 'TREINADOR']).optional(),
  active: z.boolean().optional(),
  ...adminScopeFields,
});

// ------------------------------------------------------------------
// Portal do Gestor — Avaliação de Experiência (90 dias)
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Treinamento
// ------------------------------------------------------------------

export const trainingTypeSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const trainingSchema = z.object({
  employeeId: z.string().min(1, 'Selecione o colaborador.').max(64),
  trainingTypeId: z.string().min(1, 'Selecione o tipo de treinamento.').max(64),
  result: z.enum(['APROVADO', 'APROVADO_COM_RESSALVA', 'REPROVADO'], {
    errorMap: () => ({ message: 'Selecione o resultado do treinamento.' }),
  }),
  /** Uma nota por critério do formulário: { criterionId: 'BOM' }. */
  answers: z.record(idSchema, z.enum(['RUIM', 'MEDIO', 'BOM', 'OTIMO', 'NAO'])).default({}),
  /** Respostas do cabeçalho do formulário (setor, gerente do período...). */
  contextValues: z.record(z.string().max(64), z.string().max(300))
    .refine((v) => Object.keys(v).length <= 30, 'Campos demais no cabeçalho.')
    .optional(),
  needsReinforcement: z.boolean(),
  reinforcementNotes: z.string().max(2000).optional().nullable(),
  positivePoints: z.string().max(2000).optional().nullable(),
  negativePoints: z.string().max(2000).optional().nullable(),
  observations: z.string().max(2000).optional().nullable(),
  employeeFeedback: z.string().max(2000).optional().nullable(),
  /**
   * Como o treinador fechou a ficha. `DIA` é o padrão: sem escolha explícita,
   * nada é encerrado — fechar um treinamento em definitivo tem que ser um ato
   * deliberado, nunca o efeito colateral de um cliente antigo.
   */
  closure: z.enum(['DIA', 'DEFINITIVO'], {
    errorMap: () => ({ message: 'Escolha como finalizar o treinamento.' }),
  }).default('DIA'),
}).refine(
  (d) => !d.needsReinforcement || Boolean(d.reinforcementNotes?.trim()),
  { message: 'Descreva o que precisa de reforço.', path: ['reinforcementNotes'] },
);

export const probationaryEmployeeSchema = z.object({
  fullName: z.string().min(2).max(160),
  admissionDate: z.string().datetime(),
  roleDescription: z.string().min(2).max(300),
  sectorId: idSchema,
  unitId: idSchema,
  shift: z.enum(['DIA', 'NOITE']),
  isApprentice: z.boolean().optional(),
});

/**
 * Desligamento registrado pelo RH. A data não pode ser futura: é o registro
 * de uma saída que já aconteceu (ou acontece hoje).
 */
export const terminationSchema = z.object({
  reason: z.enum(TERMINATION_REASONS, { errorMap: () => ({ message: 'Escolha o motivo do desligamento.' }) }),
  date: z.string().datetime({ message: 'Informe a data de saída.' }),
  notes: z.string().trim().max(300, 'Use até 300 caracteres na descrição.').optional(),
  // Por dia de calendário em São Paulo: a tela manda o meio-dia local do dia
  // escolhido, e "amanhã" é recusado a qualquer hora.
}).refine((d) => saoPauloDay(new Date(d.date)) <= saoPauloDay(), {
  message: 'A data de saída não pode ser futura.',
  path: ['date'],
});

/**
 * Cadastro feito pelo treinador, dentro do portal da operação.
 *
 * Aqui a data de admissão é OPCIONAL: o treinador cadastra quem chegou para
 * treinar agora, e a tela dele não pergunta essa data. Sem ela, a rota grava
 * hoje — e quem corrige, se a pessoa entrou antes, é o RH pelo painel. O
 * cadastro completo do RH (probationaryEmployeeSchema) continua exigindo.
 */
export const trainerEmployeeSchema = probationaryEmployeeSchema.extend({
  admissionDate: z.string().datetime().optional(),
});

const subAnswerValue = z.enum(['SIM', 'NAO', 'TALVEZ', 'REGULAR']);
const ratingValue = z.enum(['OTIMO', 'BOM', 'REGULAR', 'RUIM']);

function subAnswerCountRefinement(data: {
  flexibilitySubAnswers: Record<string, string>;
  interestSubAnswers: Record<string, string>;
  relationshipSubAnswers: Record<string, string>;
  learningSubAnswers: Record<string, string>;
}): boolean {
  return (
    Object.keys(data.flexibilitySubAnswers).length === 4 &&
    Object.keys(data.interestSubAnswers).length === 3 &&
    Object.keys(data.relationshipSubAnswers).length === 2 &&
    Object.keys(data.learningSubAnswers).length === 2
  );
}

const feedbackColorValue = z.enum(['VERMELHO', 'AMARELO', 'VERDE']);

/**
 * Correção da classificação fora de uma avaliação (RH). O motivo é obrigatório
 * aqui, diferente da cor definida na avaliação: mudar a cadência de alguém sem
 * uma avaliação por trás precisa deixar registrado por quê.
 */
export const colorChangeSchema = z.object({
  color: feedbackColorValue,
  reason: z.string().min(3).max(3000),
});

/**
 * Formulário único das três situações (45 dias, 90 dias e feedback recorrente):
 * são as mesmas 4 dimensões. O que muda por período — `conclusion` obrigatória
 * na experiência, `color` obrigatória no ciclo de feedback — é decidido na
 * rota, que é quem sabe o período real a partir do status do funcionário.
 */
export const evaluationSubmissionSchema = z.object({
  evaluationDate: z.string().datetime(),
  dueDateAtEvaluation: z.string().datetime(),
  flexibilityRating: ratingValue,
  flexibilitySubAnswers: z.record(z.string().max(64), subAnswerValue),
  interestRating: ratingValue,
  interestSubAnswers: z.record(z.string().max(64), subAnswerValue),
  relationshipRating: ratingValue,
  relationshipSubAnswers: z.record(z.string().max(64), subAnswerValue),
  learningRating: ratingValue,
  learningSubAnswers: z.record(z.string().max(64), subAnswerValue),
  favorableAspects: z.string().min(3).max(3000),
  unfavorableAspects: z.string().min(3).max(3000),
  classification: z.enum(['FRACO', 'ALGUMAS_POSSIBILIDADES', 'OTIMAS_PERSPECTIVAS', 'EXCELENTE_AQUISICAO']),
  conclusion: z.enum(['DEMITIR', 'EFETIVAR', 'EXTENDER']).optional(),
  color: feedbackColorValue.optional(),
  colorReason: z.string().max(3000).optional(),
  developmentPoints: z.string().max(3000).optional(),
  guidance: z.string().max(3000).optional(),
  trainingNeeds: z.string().max(3000).optional(),
  /** 2ª resposta do período que outro gestor acabou de avaliar (setor com dois gestores). O período é decidido no servidor. */
  secondOpinion: z.boolean().optional(),
}).refine(subAnswerCountRefinement, {
  message: 'Todas as sub-perguntas de cada dimensão são obrigatórias.',
  path: ['flexibilitySubAnswers'],
});

/**
 * Inscrição de um navegador para Web Push, no formato que o próprio
 * `PushSubscription.toJSON()` devolve. Os limites de tamanho existem porque
 * isto vem do cliente: endpoint é uma URL do serviço de push e as chaves são
 * base64url de tamanho fixo.
 */
// Só serviços push conhecidos (evita SSRF: registrar um endpoint apontando
// para rede interna/metadados de nuvem e o servidor fazer POST autenticado nele).
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[\w-]+\.push\.apple\.com$/,
  /^[\w-]+\.notify\.windows\.com$/,
];

function isAllowedPushEndpoint(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return ALLOWED_PUSH_HOSTS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine(isAllowedPushEndpoint, {
    message: 'Endpoint de push não reconhecido.',
  }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});
