// Spot Integra — Schema do banco de dados (Drizzle ORM / PostgreSQL)
//
// Regra de ouro: `surveyResponses` e `responseAnswers` JAMAIS armazenam
// qualquer identificador do colaborador (nome, e-mail, matrícula, CPF, IP...).

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => createId());

// ------------------------------------------------------------------
// Enums
// ------------------------------------------------------------------

export const adminRoleEnum = pgEnum('admin_role', ['SUPER_ADMIN', 'RH', 'GESTOR', 'GESTOR_LIDER', 'TREINADOR']);
export const leaderAreaEnum = pgEnum('leader_area', ['COZINHA', 'SALAO', 'ADM', 'DELIVERY']);
export const surveyStatusEnum = pgEnum('survey_status', ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED']);
export const questionTypeEnum = pgEnum('question_type', [
  'LIKERT',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'SHORT_TEXT',
  'LONG_TEXT',
  'SCALE',
  'YES_NO',
]);
export const actionPriorityEnum = pgEnum('action_priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const actionStatusEnum = pgEnum('action_status', ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'CANCELLED']);

// Portal do Gestor — avaliação de experiência (90 dias / 2 ciclos de 45).
export const employeeStatusEnum = pgEnum('employee_status', [
  'AWAITING_PERIOD_1', 'AWAITING_PERIOD_2', 'HIRED', 'TERMINATED',
]);
// Turno do funcionário em experiência — decide qual gestor (diurno/noturno)
// do setor/unidade fica responsável por avaliá-lo.
export const shiftEnum = pgEnum('shift', ['DIA', 'NOITE']);
// FIRST/SECOND são os dois ciclos da experiência (45 e 90 dias) e acontecem
// no máximo uma vez cada. FEEDBACK é o ciclo permanente que começa depois da
// avaliação de 90 dias e se repete para sempre, na cadência da cor.
export const evaluationPeriodEnum = pgEnum('evaluation_period', ['FIRST', 'SECOND', 'FEEDBACK']);
// Classificação dada pelo gestor ao fim da avaliação de 90 dias e revisada a
// cada feedback. A cor é o que define a cadência: 45 / 120 / 180 dias.
export const feedbackColorEnum = pgEnum('feedback_color', ['VERMELHO', 'AMARELO', 'VERDE']);
// Dois grupos de aviso na mesma tabela:
// - lembretes de prazo, gerados pela rotina diária (feedback e experiência);
// - movimentações, gravadas na hora em que alguém registra algo no sistema.
// Quem recebe cada tipo é decidido em src/lib/notificationEvents.ts.
export const notificationTypeEnum = pgEnum('notification_type', [
  'FEEDBACK_REMINDER',
  'EVALUATION_REMINDER',
  'EVALUATION_SUBMITTED',
  'TRAINING_CREATED',
  'TRAINING_REOPENED',
  'TRAINING_TYPE_CREATED',
  'EMPLOYEE_CREATED',
  'EMPLOYEE_UPDATED',
  'EMPLOYEE_REMOVED',
  'COLOR_CHANGED',
  // Falha da rotina diária de avisos — só para o Super Admin (src/lib/cronStatus.ts).
  'SYSTEM_ALERT',
]);
/** De qual painel a pessoa ativou o aviso no celular — decide para onde o toque leva. */
export const pushPortalEnum = pgEnum('push_portal', ['admin', 'gestor']);
export const evaluationRatingEnum = pgEnum('evaluation_rating', ['OTIMO', 'BOM', 'REGULAR', 'RUIM']);
export const evaluationClassificationEnum = pgEnum('evaluation_classification', [
  'FRACO', 'ALGUMAS_POSSIBILIDADES', 'OTIMAS_PERSPECTIVAS', 'EXCELENTE_AQUISICAO',
]);
export const evaluationConclusionEnum = pgEnum('evaluation_conclusion', ['DEMITIR', 'EFETIVAR', 'EXTENDER']);
// De onde veio a avaliação. FORMS = resposta do Google Forms usado pelo RH
// antes do portal, trazida pelo importador (scripts/import-experiencia.ts).
export const evaluationSourceEnum = pgEnum('evaluation_source', ['SISTEMA', 'FORMS']);
// Motivo do desligamento, agrupado para filtro e contagem. O texto exato que o
// DP usa ("Pedido de demissão - Aviso prévio não trabalhado") fica em
// terminationNotes; a categoria é o que a consulta avançada filtra.
export const terminationReasonEnum = pgEnum('termination_reason', [
  'DISPENSA_EXPERIENCIA',
  'PEDIDO_DEMISSAO',
  'DEMISSAO_SEM_JUSTA_CAUSA',
  'JUSTA_CAUSA',
  'ABANDONO_EMPREGO',
  'ACORDO_MUTUO',
  'FIM_APRENDIZAGEM',
  'CONTRATACAO_CANCELADA',
  'FALECIMENTO',
  'OUTRO',
]);

// ------------------------------------------------------------------
// Treinamento — módulo do TREINADOR, separado da avaliação de experiência.
// Um treinamento NÃO é uma avaliação de 45/90 dias: não tem ciclo, não muda
// o status do funcionário e não usa a classificação da gestão.
// ------------------------------------------------------------------
export const trainingResultEnum = pgEnum('training_result', ['APROVADO', 'APROVADO_COM_RESSALVA', 'REPROVADO']);
/**
 * Escala dos critérios do treinamento, como está no formulário em papel:
 * RUIM / MÉDIO / BOM / ÓTIMO. Deliberadamente separada de
 * `evaluationRatingEnum` (avaliação de experiência) — são instrumentos
 * diferentes, de áreas diferentes, e não devem se misturar em relatório.
 */
export const trainingRatingEnum = pgEnum('training_rating', ['RUIM', 'MEDIO', 'BOM', 'OTIMO', 'NAO']);
/**
 * Como o treinador fechou a ficha:
 *
 * - `DIA`        — treinamento do dia. O colaborador continua em treinamento
 *                  naquele tipo e novas fichas podem ser registradas.
 * - `DEFINITIVO` — encerra AQUELE TIPO de treinamento para AQUELE colaborador.
 *                  Nenhuma ficha nova do mesmo tipo entra depois disso, e só
 *                  RH ou Gestor Líder conseguem reabrir.
 *
 * Fichas registradas antes desta mudança ficam como `DIA`: elas foram salvas
 * quando o botão era só "Finalizar treinamento", sem a decisão de encerrar —
 * marcá-las como definitivas travaria treinamentos retroativamente.
 */
export const trainingClosureEnum = pgEnum('training_closure', ['DIA', 'DEFINITIVO']);

// ------------------------------------------------------------------
// Administração
// ------------------------------------------------------------------

export const admins = pgTable('admins', {
  id: id(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: adminRoleEnum('role').notNull().default('RH'),
  active: boolean('active').notNull().default(true),
  // Área do Líder (GESTOR_LIDER): só rótulo para organizar e filtrar os vários líderes.
  leaderArea: leaderAreaEnum('leader_area'),
  // O escopo de um GESTOR/GESTOR_LIDER (unidades, setores e turnos) mora
  // inteiro nas tabelas adminUnits/adminSectors/adminShifts — vários de cada.
  // SUPER_ADMIN/RH não têm escopo (enxergam tudo pelo painel admin).
  /**
   * Verificação em duas etapas (TOTP, app autenticador). Opcional por conta;
   * quando ativa, vale nos dois portais. Os segredos ficam cifrados com uma
   * chave derivada do AUTH_SECRET (src/lib/secretBox.ts): uma cópia do banco
   * sozinha não gera códigos. Ver src/lib/mfa.ts.
   * - mfaPendingSecret: segredo gerado na configuração, ainda não confirmado.
   * - mfaLastStep: último passo de 30 s aceito — o mesmo código não entra duas vezes.
   * - mfaRecoveryCodes: HMAC dos códigos de recuperação ainda não usados.
   */
  mfaSecret: text('mfa_secret'),
  mfaPendingSecret: text('mfa_pending_secret'),
  mfaEnabledAt: timestamp('mfa_enabled_at'),
  mfaLastStep: integer('mfa_last_step'),
  mfaRecoveryCodes: jsonb('mfa_recovery_codes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex('admins_email_idx').on(table.email),
}));

// Unidades vinculadas a um gestor — um GESTOR/GESTOR_LIDER pode estar
// registrado em mais de uma unidade (ex.: cobre duas lojas).
export const adminUnits = pgTable('admin_units', {
  id: id(),
  adminId: text('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  unitId: text('unit_id').notNull().references(() => units.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  adminUnitIdx: uniqueIndex('admin_units_admin_unit_idx').on(table.adminId, table.unitId),
}));

// Setores vinculados a um gestor — mesmo padrão de adminUnits. Um Gestor
// Líder normalmente cobre vários setores (ex.: Salão - Bar + Salão -
// Atendimento); um Gestor comum costuma ter só um, mas o modelo é o mesmo.
export const adminSectors = pgTable('admin_sectors', {
  id: id(),
  adminId: text('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  sectorId: text('sector_id').notNull().references(() => sectors.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  adminSectorIdx: uniqueIndex('admin_sectors_admin_sector_idx').on(table.adminId, table.sectorId),
}));

// Turnos vinculados a um gestor — mesmo padrão de adminUnits/adminSectors.
// Um Gestor comum costuma ter um só (é o gestor do diurno OU do noturno);
// um Gestor Líder normalmente cobre os dois, porque acompanha a operação
// inteira do setor.
export const adminShifts = pgTable('admin_shifts', {
  id: id(),
  adminId: text('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  shift: shiftEnum('shift').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  adminShiftIdx: uniqueIndex('admin_shifts_admin_shift_idx').on(table.adminId, table.shift),
}));

// ------------------------------------------------------------------
// Treinamento
// ------------------------------------------------------------------

/**
 * Tipos de treinamento — catálogo gerenciável (ex.: "Avaliações do Bar",
 * "Novos Colaboradores", "Gerentes"). Mesmo padrão de sectors/units.
 */
export const trainingTypes = pgTable('training_types', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  /**
   * Campos do cabeçalho do formulário, que mudam por tipo (o de gerência pede
   * "gerente do período" e "nº de pessoas"; o do bar vai pedir outra coisa).
   * Formato: [{ key, label, type: 'text'|'number' }].
   */
  contextFields: jsonb('context_fields'),
  /**
   * A régua muda por formulário: gerência e novos usam RUIM/MÉDIO/BOM/ÓTIMO,
   * o do bar usa RUIM/MÉDIO/BOM/NÃO. Formato: [{ value, label }].
   */
  ratingOptions: jsonb('rating_options'),
  /** Rótulos do rodapé — "Pontos positivos/negativos" ou "fortes/de melhoria". */
  positiveLabel: text('positive_label'),
  negativeLabel: text('negative_label'),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('training_types_name_idx').on(table.name),
}));

/** Os itens avaliados de um tipo de treinamento (ex.: PONTUALIDADE / Horário). */
export const trainingCriteria = pgTable('training_criteria', {
  id: id(),
  trainingTypeId: text('training_type_id').notNull().references(() => trainingTypes.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  hint: text('hint'),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  typeIdx: index('training_criteria_type_idx').on(table.trainingTypeId),
}));

/**
 * Materiais de apoio de um tipo de treinamento (imagens, instruções).
 * A estrutura existe desde já; o conteúdo é enviado pelo cliente depois —
 * nada é pré-preenchido com material fictício.
 */
export const trainingMaterials = pgTable('training_materials', {
  id: id(),
  trainingTypeId: text('training_type_id').notNull().references(() => trainingTypes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // data: URI da imagem, mesmo padrão já usado no tema. Nulo enquanto o
  // material for só texto/instrução.
  imageDataUri: text('image_data_uri'),
  instructions: text('instructions'),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  typeIdx: index('training_materials_type_idx').on(table.trainingTypeId),
}));

/** Um treinamento realizado: quem treinou, quem foi treinado e o resultado. */
export const trainings = pgTable('trainings', {
  id: id(),
  employeeId: text('employee_id').notNull().references(() => probationaryEmployees.id, { onDelete: 'cascade' }),
  trainingTypeId: text('training_type_id').notNull().references(() => trainingTypes.id),
  trainerAdminId: text('trainer_admin_id').references(() => admins.id, { onDelete: 'set null' }),
  trainingDate: timestamp('training_date').notNull(),
  result: trainingResultEnum('result').notNull(),
  needsReinforcement: boolean('needs_reinforcement').notNull().default(false),
  reinforcementNotes: text('reinforcement_notes'),
  // Os dois campos do rodapé do formulário.
  positivePoints: text('positive_points'),
  negativePoints: text('negative_points'),
  observations: text('observations'),
  // Sugestão ou crítica trazida pelo colaborador durante o treinamento.
  employeeFeedback: text('employee_feedback'),
  /** Respostas do cabeçalho, conforme `trainingTypes.contextFields`. */
  contextValues: jsonb('context_values'),
  /** Treinamento do dia ou encerramento definitivo — ver trainingClosureEnum. */
  closure: trainingClosureEnum('closure').notNull().default('DIA'),
  // Reabertura de um encerramento definitivo (RH / Gestor Líder). Reabrir
  // devolve a ficha para `DIA`; estes dois campos são o rastro de que aquele
  // encerramento existiu e de quem o desfez.
  reopenedAt: timestamp('reopened_at'),
  reopenedById: text('reopened_by_id').references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  employeeIdx: index('trainings_employee_idx').on(table.employeeId),
  dateIdx: index('trainings_date_idx').on(table.trainingDate),
  // Um único encerramento definitivo por colaborador + tipo. É o que garante,
  // no banco, que dois treinadores clicando ao mesmo tempo não fecham o mesmo
  // treinamento duas vezes; fichas do dia (`DIA`) ficam de fora do índice e
  // podem se repetir à vontade.
  definitivoUnico: uniqueIndex('trainings_definitivo_employee_type_idx')
    .on(table.employeeId, table.trainingTypeId)
    .where(sql`${table.closure} = 'DEFINITIVO'`),
}));

/** Uma nota por critério dentro de um treinamento. */
export const trainingAnswers = pgTable('training_answers', {
  id: id(),
  trainingId: text('training_id').notNull().references(() => trainings.id, { onDelete: 'cascade' }),
  criterionId: text('criterion_id').notNull().references(() => trainingCriteria.id, { onDelete: 'cascade' }),
  rating: trainingRatingEnum('rating').notNull(),
}, (table) => ({
  trainingIdx: index('training_answers_training_idx').on(table.trainingId),
  uniqueAnswer: uniqueIndex('training_answers_training_criterion_idx').on(table.trainingId, table.criterionId),
}));

// Catálogo de permissões e o conjunto padrão por papel — estrutura pronta
// para as próximas etapas ligarem às rotas; hasPermission() (src/lib/
// permissions.ts) já sabe ler isto, mas nenhuma rota existente depende disso
// ainda.
export const permissions = pgTable('permissions', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const rolePermissions = pgTable('role_permissions', {
  id: id(),
  role: adminRoleEnum('role').notNull(),
  permissionKey: text('permission_key').notNull().references(() => permissions.key, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  rolePermissionIdx: uniqueIndex('role_permissions_role_key_idx').on(table.role, table.permissionKey),
}));

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  adminId: text('admin_id').references(() => admins.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  metadata: jsonb('metadata'),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  adminIdIdx: index('audit_logs_admin_id_idx').on(table.adminId),
}));

/**
 * Contador de tentativas (login, primeiro acesso, envio de pesquisa)
 * compartilhado entre as instâncias. Em serverless cada instância tinha o seu
 * Map em memória, e o limite valia só dentro dela.
 *
 * `key` é um HMAC (escopo + identidade): o IP ou o e-mail nunca ficam em
 * claro aqui. Nada nesta tabela aponta para uma resposta de pesquisa.
 */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at').notNull(),
}, (table) => ({
  resetAtIdx: index('rate_limits_reset_at_idx').on(table.resetAt),
}));

// ------------------------------------------------------------------
// Estrutura organizacional
// ------------------------------------------------------------------

export const sectors = pgTable('sectors', {
  id: id(),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  /**
   * Se o setor participa do ciclo de cores (🔴45 / 🟡120 / 🟢180 dias).
   *
   * O projeto das cores é do Salão. Quem não participa faz normalmente as
   * avaliações de 45 e 90 dias, mas efetiva SEM cor: não ganha data de próximo
   * feedback, não entra nos avisos e não aparece no sino. É uma chave do
   * cadastro, e não o nome "Salão" no código, para o RH incluir outro setor
   * amanhã sem precisar de versão nova do sistema.
   */
  usesColorCycle: boolean('uses_color_cycle').notNull().default(false),
  /**
   * Onde o setor aparece. Quase todo setor vale para os dois, mas a
   * Administração é dividida por gestor (Financeiro, RH, Compras,
   * Manutenção) só nas avaliações de desempenho: na pesquisa de clima o
   * funcionário continua escolhendo "Administração", porque com uma ou duas
   * pessoas por área a resposta deixaria de ser anônima.
   * - inSurvey: lista do formulário da pesquisa e dos planos de ação.
   * - inEvaluation: cadastro de funcionário e escopo de gestor/treinador.
   */
  inSurvey: boolean('in_survey').notNull().default(true),
  inEvaluation: boolean('in_evaluation').notNull().default(true),
  /**
   * Se o setor participa do módulo de treinamento. O treinamento é do Salão
   * (Atendimento, Bar, Gerente): só colaboradores destes setores aparecem para
   * treinar, e só eles podem estar no escopo de um treinador. Chave do
   * cadastro, como as de cima — incluir outro setor é marcar a caixa.
   */
  inTraining: boolean('in_training').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('sectors_name_idx').on(table.name),
}));

export const units = pgTable('units', {
  id: id(),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('units_name_idx').on(table.name),
}));

export const dimensions = pgTable('dimensions', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('dimensions_name_idx').on(table.name),
}));

// ------------------------------------------------------------------
// Pesquisas
// ------------------------------------------------------------------

export const surveys = pgTable('surveys', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  status: surveyStatusEnum('status').notNull().default('DRAFT'),
  openDate: timestamp('open_date'),
  closeDate: timestamp('close_date'),
  eligiblePopulation: integer('eligible_population'),
  anonymityThreshold: integer('anonymity_threshold').notNull().default(5),
  suggestedNextSurvey: timestamp('suggested_next_survey'),
  duplicatedFromId: text('duplicated_from_id'),
  sourceTemplateId: text('source_template_id'),
  /**
   * Exige um código de participação de uso único (survey_access_codes) para
   * responder. Desligado por padrão: a pesquisa continua aberta como antes até
   * o RH gerar os códigos e ligar a chave.
   */
  requireAccessCode: boolean('require_access_code').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Códigos de participação de uso único.
 *
 * Sem código, a pesquisa pública aceita qualquer envio: alguém podia mandar
 * respostas falsas para um setor pequeno e, subtraindo, descobrir o que um
 * colega respondeu. Com código, cada papelzinho entregue na loja vale UMA
 * resposta.
 *
 * Anonimato: esta tabela NÃO aponta para a resposta, e a resposta NÃO aponta
 * para o código. Só fica registrado que o código foi usado (usedAt, no dia,
 * sem hora). O código em si nunca é gravado: só o HMAC dele, e o texto aparece
 * uma única vez, na planilha baixada no momento em que é gerado.
 */
export const surveyAccessCodes = pgTable('survey_access_codes', {
  id: id(),
  surveyId: text('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  // Lote de geração — para o RH saber quantos códigos saíram em cada impressão.
  batch: integer('batch').notNull().default(1),
  usedOn: timestamp('used_on'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  codeHashIdx: uniqueIndex('survey_access_codes_code_hash_idx').on(table.codeHash),
  surveyIdIdx: index('survey_access_codes_survey_id_idx').on(table.surveyId),
}));

/**
 * Bilhetes de resposta já usados (uso único).
 *
 * O código do papel NÃO é gasto junto com a resposta: se fosse, as duas
 * linhas nasceriam na mesma transação (mesmo xmin no Postgres) e quem tem
 * acesso ao banco e sabe quem recebeu cada papel ligaria código → resposta.
 * Em vez disso o código é trocado, ao começar a pesquisa, por um bilhete
 * assinado que não carrega nada do código (src/lib/surveyTicket.ts); no envio
 * só o HMAC do bilhete entra aqui, na transação da resposta. Nenhum registro
 * liga bilhete a código. Sem data: nem o dia do uso fica gravado.
 */
export const surveyTicketUses = pgTable('survey_ticket_uses', {
  ticketHash: text('ticket_hash').primaryKey(),
  surveyId: text('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
});

export const questions = pgTable('questions', {
  id: id(),
  surveyId: text('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  dimensionId: text('dimension_id').references(() => dimensions.id),
  text: text('text').notNull(),
  type: questionTypeEnum('type').notNull(),
  required: boolean('required').notNull().default(true),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  // Só usados quando type === 'SCALE' (escala numérica genérica, ex. 1 a 10).
  scaleMin: integer('scale_min'),
  scaleMax: integer('scale_max'),
  /**
   * Pergunta de eNPS ("De 0 a 10, quanto você recomendaria o Spot como lugar
   * para trabalhar?"). É uma SCALE 0–10 comum na tela e na resposta; a marca só
   * diz aos resultados para calcular o eNPS (% promotores − % detratores).
   */
  isEnps: boolean('is_enps').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  surveyIdIdx: index('questions_survey_id_idx').on(table.surveyId),
  dimensionIdIdx: index('questions_dimension_id_idx').on(table.dimensionId),
  // No máximo UMA pergunta de eNPS ativa por pesquisa: com duas, os resultados
  // teriam de escolher uma (e a escolha podia cair numa sem respostas).
  enpsUnicaAtiva: uniqueIndex('questions_enps_ativa_por_pesquisa_idx')
    .on(table.surveyId)
    .where(sql`${table.isEnps} AND ${table.active}`),
}));

export const questionOptions = pgTable('question_options', {
  id: id(),
  questionId: text('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  order: integer('order').notNull().default(0),
}, (table) => ({
  questionIdIdx: index('question_options_question_id_idx').on(table.questionId),
}));

// ------------------------------------------------------------------
// Biblioteca de modelos de pergunta (templates)
//
// Espelha surveys/questions/questionOptions de propósito: perguntas de
// modelo NUNCA compartilham linha com perguntas de pesquisa real — usar um
// modelo para criar uma pesquisa (ou salvar uma pesquisa como modelo) SEMPRE
// copia as perguntas para linhas novas, para que editar o modelo depois
// nunca altere retroativamente pesquisas já criadas a partir dele.
// ------------------------------------------------------------------

export const templateCategories = pgTable('template_categories', {
  id: id(),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('template_categories_name_idx').on(table.name),
}));

export const questionTemplates = pgTable('question_templates', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: text('category_id').references(() => templateCategories.id),
  active: boolean('active').notNull().default(true),
  duplicatedFromTemplateId: text('duplicated_from_template_id'),
  createdById: text('created_by_id').references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  categoryIdIdx: index('question_templates_category_id_idx').on(table.categoryId),
}));

export const templateQuestions = pgTable('template_questions', {
  id: id(),
  templateId: text('template_id').notNull().references(() => questionTemplates.id, { onDelete: 'cascade' }),
  dimensionId: text('dimension_id').references(() => dimensions.id),
  text: text('text').notNull(),
  type: questionTypeEnum('type').notNull(),
  required: boolean('required').notNull().default(true),
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  scaleMin: integer('scale_min'),
  scaleMax: integer('scale_max'),
  isEnps: boolean('is_enps').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  templateIdIdx: index('template_questions_template_id_idx').on(table.templateId),
  dimensionIdIdx: index('template_questions_dimension_id_idx').on(table.dimensionId),
}));

export const templateQuestionOptions = pgTable('template_question_options', {
  id: id(),
  templateQuestionId: text('template_question_id').notNull().references(() => templateQuestions.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  order: integer('order').notNull().default(0),
}, (table) => ({
  templateQuestionIdIdx: index('template_question_options_template_question_id_idx').on(table.templateQuestionId),
}));

// ------------------------------------------------------------------
// Portal do Gestor — Avaliação de Experiência (90 dias)
//
// Diferente de surveyResponses/responseAnswers, estas tabelas são
// INTENCIONALMENTE identificadas (funcionário avaliado + gestor avaliador).
// Não têm nenhuma relação com surveys/surveyResponses/questions — só
// referenciam sectors/units/admins, que já são cadastros organizacionais
// não-anônimos usados em outros pontos do sistema (ex.: actionPlans).
// ------------------------------------------------------------------

export const probationaryEmployees = pgTable('probationary_employees', {
  id: id(),
  fullName: text('full_name').notNull(),
  admissionDate: timestamp('admission_date').notNull(),
  roleDescription: text('role_description').notNull(),
  sectorId: text('sector_id').notNull().references(() => sectors.id),
  unitId: text('unit_id').notNull().references(() => units.id),
  shift: shiftEnum('shift').notNull().default('DIA'),
  // Último dia de cada contrato (admissionDate + 44 / + 89 dias, ver
  // computeDueDates), calculados na API no momento do cadastro.
  period1DueDate: timestamp('period_1_due_date').notNull(),
  period2DueDate: timestamp('period_2_due_date').notNull(),
  status: employeeStatusEnum('status').notNull().default('AWAITING_PERIOD_1'),
  // Jovem aprendiz tem contrato de aprendizagem, não de experiência: aparece
  // na lista e nos filtros, mas não tem prazo de 45/90, lembrete nem avaliação.
  isApprentice: boolean('is_apprentice').notNull().default(false),
  // Desligamento registrado pelo RH (status TERMINATED). Nulos para quem saiu
  // por uma avaliação com conclusão "Demitir" antes deste registro existir.
  terminationReason: terminationReasonEnum('termination_reason'),
  terminationDate: timestamp('termination_date'),
  terminationNotes: text('termination_notes'),
  // Situação antes de o RH desligar ou marcar como aprendiz. É para onde o
  // "desfazer" volta: recalcular pelas avaliações rebaixaria quem foi
  // efetivado sem avaliação registrada (histórico da planilha do DP).
  previousStatus: employeeStatusEnum('previous_status'),
  // Estado atual do ciclo permanente de feedback. Ambos ficam nulos enquanto o
  // colaborador está em experiência e são preenchidos na avaliação de 90 dias.
  // São materializados (e não derivados a cada consulta) pelo mesmo motivo de
  // period1DueDate/period2DueDate: o painel e a rotina de avisos precisam
  // filtrar e ordenar por essa data direto no banco.
  currentColor: feedbackColorEnum('current_color'),
  nextFeedbackDueDate: timestamp('next_feedback_due_date'),
  createdById: text('created_by_id').references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  sectorIdIdx: index('probationary_employees_sector_id_idx').on(table.sectorId),
  unitIdIdx: index('probationary_employees_unit_id_idx').on(table.unitId),
  statusIdx: index('probationary_employees_status_idx').on(table.status),
  nextFeedbackDueDateIdx: index('probationary_employees_next_feedback_due_date_idx').on(table.nextFeedbackDueDate),
}));

export const performanceEvaluations = pgTable('performance_evaluations', {
  id: id(),
  employeeId: text('employee_id').notNull().references(() => probationaryEmployees.id, { onDelete: 'cascade' }),
  period: evaluationPeriodEnum('period').notNull(),
  // Ordem dentro do período. No portal, FIRST e SECOND acontecem uma única vez
  // e ficam em 1. A exceção é o histórico do Forms, onde dois gestores às vezes
  // avaliaram o mesmo período: a 2ª resposta entra como 2. FEEDBACK se repete,
  // e aqui vai 1, 2, 3... o que também dá o rótulo da linha do tempo
  // ("3º feedback") sem precisar contar linhas na consulta.
  cycleNumber: integer('cycle_number').notNull().default(1),
  evaluationDate: timestamp('evaluation_date').notNull(),
  dueDateAtEvaluation: timestamp('due_date_at_evaluation').notNull(),
  evaluatorAdminId: text('evaluator_admin_id').references(() => admins.id, { onDelete: 'set null' }),
  // Nome do avaliador quando ele não tem conta no sistema (respostas do Forms).
  evaluatorName: text('evaluator_name'),
  source: evaluationSourceEnum('source').notNull().default('SISTEMA'),
  // Identidade da resposta no Forms (carimbo + colaborador): é o que deixa o
  // importador rodar de novo sem duplicar avaliação.
  externalId: text('external_id'),
  // Uma coluna de nota por dimensão (fixas, sempre as 4 mesmas) em vez de um
  // array/jsonb único — permite agregação direta (AVG por dimensão) em SQL.
  flexibilityRating: evaluationRatingEnum('flexibility_rating').notNull(),
  flexibilitySubAnswers: jsonb('flexibility_sub_answers').notNull(),
  interestRating: evaluationRatingEnum('interest_rating').notNull(),
  interestSubAnswers: jsonb('interest_sub_answers').notNull(),
  relationshipRating: evaluationRatingEnum('relationship_rating').notNull(),
  relationshipSubAnswers: jsonb('relationship_sub_answers').notNull(),
  learningRating: evaluationRatingEnum('learning_rating').notNull(),
  learningSubAnswers: jsonb('learning_sub_answers').notNull(),
  favorableAspects: text('favorable_aspects').notNull(),
  unfavorableAspects: text('unfavorable_aspects').notNull(),
  classification: evaluationClassificationEnum('classification').notNull(),
  // Só existe na experiência: um feedback de colaborador já efetivado não
  // decide demitir/efetivar/estender, por isso é nulo quando period=FEEDBACK.
  conclusion: evaluationConclusionEnum('conclusion'),
  // Ciclo permanente de feedback. `color` é a classificação definida pelo
  // gestor nesta avaliação e `nextDueDate` é a data que ela gerou — guardadas
  // na própria avaliação para que o histórico mostre a decisão tomada naquele
  // dia, mesmo depois de a cor do funcionário mudar.
  color: feedbackColorEnum('color'),
  nextDueDate: timestamp('next_due_date'),
  developmentPoints: text('development_points'),
  guidance: text('guidance'),
  trainingNeeds: text('training_needs'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  employeeIdIdx: index('performance_evaluations_employee_id_idx').on(table.employeeId),
  employeePeriodIdx: uniqueIndex('performance_evaluations_employee_period_idx')
    .on(table.employeeId, table.period, table.cycleNumber),
  externalIdIdx: uniqueIndex('performance_evaluations_external_id_idx').on(table.externalId),
}));

/**
 * Avisos internos, destinados a um usuário do sistema (nunca ao funcionário
 * avaliado — não existe login para ele).
 *
 * O unique (admin, tipo, funcionário, prazo, antecedência) é o que torna a
 * rotina diária idempotente: se ela rodar duas vezes no mesmo dia, ou for
 * reexecutada depois de uma falha, o mesmo lembrete não chega duas vezes.
 * Movimentações não têm prazo (`dueDate` nulo) e por isso nunca colidem no
 * unique — cada registro feito no sistema é um aviso próprio.
 */
export const notifications = pgTable('notifications', {
  id: id(),
  adminId: text('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  employeeId: text('employee_id').references(() => probationaryEmployees.id, { onDelete: 'cascade' }),
  // Prazo a que o lembrete se refere e com quantos dias de antecedência ele
  // saiu (negativo = atrasado). Nulos numa movimentação.
  dueDate: timestamp('due_date'),
  offsetDays: integer('offset_days'),
  /** Quem fez a movimentação. Nulo nos lembretes, que são da rotina. */
  actorAdminId: text('actor_admin_id').references(() => admins.id, { onDelete: 'set null' }),
  message: text('message').notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  adminIdIdx: index('notifications_admin_id_idx').on(table.adminId),
  createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
  dedupeIdx: uniqueIndex('notifications_dedupe_idx')
    .on(table.adminId, table.type, table.employeeId, table.dueDate, table.offsetDays),
}));

/**
 * Um navegador inscrito para receber aviso no celular (Web Push).
 *
 * A inscrição é do NAVEGADOR, não da pessoa: o mesmo usuário pode ter o
 * celular e o computador inscritos, e o mesmo aparelho pode trocar de dono
 * dentro do restaurante. Por isso o `endpoint` é a chave única — quando o
 * navegador reinscreve, a linha existente é atualizada em vez de duplicar.
 *
 * `p256dh` e `auth` são as chaves públicas que o navegador gera para
 * criptografar a mensagem: sem elas o servidor não consegue enviar nada, e
 * elas sozinhas não dão acesso a nada além de enviar aviso para aquele
 * aparelho. O conteúdo do aviso nunca leva dado sensível — só o nome do
 * colaborador e o prazo, o mesmo que já aparece no sino.
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  adminId: text('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  portal: pushPortalEnum('portal').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  /** Só para a pessoa reconhecer o aparelho numa lista ("Chrome no Android"). */
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastSuccessAt: timestamp('last_success_at'),
}, (table) => ({
  adminIdx: index('push_subscriptions_admin_idx').on(table.adminId),
  endpointIdx: uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint),
}));

/**
 * Trilha de mudanças de classificação por cor. Não é redundante com
 * `performance_evaluations`: registra explicitamente a cor ANTERIOR, o motivo
 * e quem mudou, que é o que o RH precisa para entender por que a cadência de
 * um colaborador mudou — sem ter que comparar duas avaliações lado a lado.
 */
export const employeeColorChanges = pgTable('employee_color_changes', {
  id: id(),
  employeeId: text('employee_id').notNull().references(() => probationaryEmployees.id, { onDelete: 'cascade' }),
  // Nulo se a cor for ajustada fora de uma avaliação (correção pelo RH).
  evaluationId: text('evaluation_id').references(() => performanceEvaluations.id, { onDelete: 'set null' }),
  // Nulo na primeira classificação, definida na avaliação de 90 dias.
  previousColor: feedbackColorEnum('previous_color'),
  newColor: feedbackColorEnum('new_color').notNull(),
  reason: text('reason').notNull(),
  nextDueDate: timestamp('next_due_date').notNull(),
  changedByAdminId: text('changed_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  employeeIdIdx: index('employee_color_changes_employee_id_idx').on(table.employeeId),
  createdAtIdx: index('employee_color_changes_created_at_idx').on(table.createdAt),
}));

// ------------------------------------------------------------------
// Respostas — SEMPRE anônimas
// ------------------------------------------------------------------

export const surveyResponses = pgTable('survey_responses', {
  id: id(),
  surveyId: text('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  sectorId: text('sector_id').notNull().references(() => sectors.id),
  // Nullable: respostas coletadas antes da unidade existir como recorte não têm esse dado.
  unitId: text('unit_id').references(() => units.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Nenhum outro campo. Nenhum identificador individual. Ponto final.
}, (table) => ({
  surveyIdIdx: index('survey_responses_survey_id_idx').on(table.surveyId),
  sectorIdIdx: index('survey_responses_sector_id_idx').on(table.sectorId),
  unitIdIdx: index('survey_responses_unit_id_idx').on(table.unitId),
}));

export const responseAnswers = pgTable('response_answers', {
  id: id(),
  responseId: text('response_id').notNull().references(() => surveyResponses.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => questions.id),
  numericValue: integer('numeric_value'),
  textValue: text('text_value'),
  choiceValues: jsonb('choice_values'),
}, (table) => ({
  responseIdIdx: index('response_answers_response_id_idx').on(table.responseId),
  questionIdIdx: index('response_answers_question_id_idx').on(table.questionId),
}));

// ------------------------------------------------------------------
// Snapshot (resumo executivo congelado no encerramento da pesquisa)
// ------------------------------------------------------------------

export const surveySnapshots = pgTable('survey_snapshots', {
  id: id(),
  surveyId: text('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  data: jsonb('data').notNull(),
}, (table) => ({
  surveyIdIdx: uniqueIndex('survey_snapshots_survey_id_idx').on(table.surveyId),
}));

// ------------------------------------------------------------------
// Plano de ação
// ------------------------------------------------------------------

export const actionPlans = pgTable('action_plans', {
  id: id(),
  surveyId: text('survey_id').references(() => surveys.id, { onDelete: 'set null' }),
  problem: text('problem').notNull(),
  dimensionId: text('dimension_id').references(() => dimensions.id),
  sectorId: text('sector_id').references(() => sectors.id),
  unitId: text('unit_id').references(() => units.id),
  priority: actionPriorityEnum('priority').notNull().default('MEDIUM'),
  action: text('action').notNull(),
  owner: text('owner').notNull(),
  dueDate: timestamp('due_date'),
  status: actionStatusEnum('status').notNull().default('NOT_STARTED'),
  notes: text('notes'),
  createdById: text('created_by_id').references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  surveyIdIdx: index('action_plans_survey_id_idx').on(table.surveyId),
  statusIdx: index('action_plans_status_idx').on(table.status),
}));

// ------------------------------------------------------------------
// Configurações do sistema
// ------------------------------------------------------------------

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ------------------------------------------------------------------
// Relations (usadas pelas queries aninhadas do Drizzle)
// ------------------------------------------------------------------

export const surveysRelations = relations(surveys, ({ many, one }) => ({
  questions: many(questions),
  accessCodes: many(surveyAccessCodes),
  responses: many(surveyResponses),
  actionPlans: many(actionPlans),
  snapshot: one(surveySnapshots, { fields: [surveys.id], references: [surveySnapshots.surveyId] }),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  survey: one(surveys, { fields: [questions.surveyId], references: [surveys.id] }),
  dimension: one(dimensions, { fields: [questions.dimensionId], references: [dimensions.id] }),
  options: many(questionOptions),
  answers: many(responseAnswers),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one }) => ({
  question: one(questions, { fields: [questionOptions.questionId], references: [questions.id] }),
}));

export const templateCategoriesRelations = relations(templateCategories, ({ many }) => ({
  templates: many(questionTemplates),
}));

export const questionTemplatesRelations = relations(questionTemplates, ({ one, many }) => ({
  category: one(templateCategories, { fields: [questionTemplates.categoryId], references: [templateCategories.id] }),
  questions: many(templateQuestions),
  createdBy: one(admins, { fields: [questionTemplates.createdById], references: [admins.id] }),
}));

export const templateQuestionsRelations = relations(templateQuestions, ({ one, many }) => ({
  template: one(questionTemplates, { fields: [templateQuestions.templateId], references: [questionTemplates.id] }),
  dimension: one(dimensions, { fields: [templateQuestions.dimensionId], references: [dimensions.id] }),
  options: many(templateQuestionOptions),
}));

export const templateQuestionOptionsRelations = relations(templateQuestionOptions, ({ one }) => ({
  question: one(templateQuestions, { fields: [templateQuestionOptions.templateQuestionId], references: [templateQuestions.id] }),
}));

export const surveyAccessCodesRelations = relations(surveyAccessCodes, ({ one }) => ({
  survey: one(surveys, { fields: [surveyAccessCodes.surveyId], references: [surveys.id] }),
}));

export const surveyResponsesRelations = relations(surveyResponses, ({ one, many }) => ({
  survey: one(surveys, { fields: [surveyResponses.surveyId], references: [surveys.id] }),
  sector: one(sectors, { fields: [surveyResponses.sectorId], references: [sectors.id] }),
  unit: one(units, { fields: [surveyResponses.unitId], references: [units.id] }),
  answers: many(responseAnswers),
}));

export const responseAnswersRelations = relations(responseAnswers, ({ one }) => ({
  response: one(surveyResponses, { fields: [responseAnswers.responseId], references: [surveyResponses.id] }),
  question: one(questions, { fields: [responseAnswers.questionId], references: [questions.id] }),
}));

export const dimensionsRelations = relations(dimensions, ({ many }) => ({
  questions: many(questions),
  templateQuestions: many(templateQuestions),
}));

export const sectorsRelations = relations(sectors, ({ many }) => ({
  responses: many(surveyResponses),
}));

export const unitsRelations = relations(units, ({ many }) => ({
  responses: many(surveyResponses),
  actionPlans: many(actionPlans),
}));

export const actionPlansRelations = relations(actionPlans, ({ one }) => ({
  survey: one(surveys, { fields: [actionPlans.surveyId], references: [surveys.id] }),
  dimension: one(dimensions, { fields: [actionPlans.dimensionId], references: [dimensions.id] }),
  sector: one(sectors, { fields: [actionPlans.sectorId], references: [sectors.id] }),
  unit: one(units, { fields: [actionPlans.unitId], references: [units.id] }),
  createdBy: one(admins, { fields: [actionPlans.createdById], references: [admins.id] }),
}));

export const adminsRelations = relations(admins, ({ many }) => ({
  auditLogs: many(auditLogs),
  pushSubscriptions: many(pushSubscriptions),
  actionPlans: many(actionPlans),
  createdTemplates: many(questionTemplates),
  scopedUnits: many(adminUnits),
  scopedSectors: many(adminSectors),
  scopedShifts: many(adminShifts),
  createdEmployees: many(probationaryEmployees),
  evaluationsGiven: many(performanceEvaluations),
}));

export const adminUnitsRelations = relations(adminUnits, ({ one }) => ({
  admin: one(admins, { fields: [adminUnits.adminId], references: [admins.id] }),
  unit: one(units, { fields: [adminUnits.unitId], references: [units.id] }),
}));

export const adminSectorsRelations = relations(adminSectors, ({ one }) => ({
  admin: one(admins, { fields: [adminSectors.adminId], references: [admins.id] }),
  sector: one(sectors, { fields: [adminSectors.sectorId], references: [sectors.id] }),
}));

export const adminShiftsRelations = relations(adminShifts, ({ one }) => ({
  admin: one(admins, { fields: [adminShifts.adminId], references: [admins.id] }),
}));

// Sem esta relation, GET /api/admin/audit-logs quebrava em runtime: a rota
// pede `with: { admin }` e o Drizzle não sabia resolver o vínculo.
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  admin: one(admins, { fields: [auditLogs.adminId], references: [admins.id] }),
}));

export const trainingTypesRelations = relations(trainingTypes, ({ many }) => ({
  materials: many(trainingMaterials),
  criteria: many(trainingCriteria),
  trainings: many(trainings),
}));

export const trainingCriteriaRelations = relations(trainingCriteria, ({ one, many }) => ({
  trainingType: one(trainingTypes, { fields: [trainingCriteria.trainingTypeId], references: [trainingTypes.id] }),
  answers: many(trainingAnswers),
}));

export const trainingAnswersRelations = relations(trainingAnswers, ({ one }) => ({
  training: one(trainings, { fields: [trainingAnswers.trainingId], references: [trainings.id] }),
  criterion: one(trainingCriteria, { fields: [trainingAnswers.criterionId], references: [trainingCriteria.id] }),
}));

export const trainingMaterialsRelations = relations(trainingMaterials, ({ one }) => ({
  trainingType: one(trainingTypes, { fields: [trainingMaterials.trainingTypeId], references: [trainingTypes.id] }),
}));

export const trainingsRelations = relations(trainings, ({ one, many }) => ({
  employee: one(probationaryEmployees, { fields: [trainings.employeeId], references: [probationaryEmployees.id] }),
  trainingType: one(trainingTypes, { fields: [trainings.trainingTypeId], references: [trainingTypes.id] }),
  trainer: one(admins, { fields: [trainings.trainerAdminId], references: [admins.id] }),
  reopenedBy: one(admins, { fields: [trainings.reopenedById], references: [admins.id] }),
  answers: many(trainingAnswers),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  permission: one(permissions, { fields: [rolePermissions.permissionKey], references: [permissions.key] }),
}));

export const probationaryEmployeesRelations = relations(probationaryEmployees, ({ one, many }) => ({
  sector: one(sectors, { fields: [probationaryEmployees.sectorId], references: [sectors.id] }),
  unit: one(units, { fields: [probationaryEmployees.unitId], references: [units.id] }),
  createdBy: one(admins, { fields: [probationaryEmployees.createdById], references: [admins.id] }),
  evaluations: many(performanceEvaluations),
  trainings: many(trainings),
  colorChanges: many(employeeColorChanges),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  admin: one(admins, { fields: [notifications.adminId], references: [admins.id] }),
  actor: one(admins, { fields: [notifications.actorAdminId], references: [admins.id] }),
  employee: one(probationaryEmployees, { fields: [notifications.employeeId], references: [probationaryEmployees.id] }),
}));

export const employeeColorChangesRelations = relations(employeeColorChanges, ({ one }) => ({
  employee: one(probationaryEmployees, { fields: [employeeColorChanges.employeeId], references: [probationaryEmployees.id] }),
  evaluation: one(performanceEvaluations, { fields: [employeeColorChanges.evaluationId], references: [performanceEvaluations.id] }),
  changedBy: one(admins, { fields: [employeeColorChanges.changedByAdminId], references: [admins.id] }),
}));

export const performanceEvaluationsRelations = relations(performanceEvaluations, ({ one }) => ({
  employee: one(probationaryEmployees, { fields: [performanceEvaluations.employeeId], references: [probationaryEmployees.id] }),
  evaluator: one(admins, { fields: [performanceEvaluations.evaluatorAdminId], references: [admins.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  admin: one(admins, { fields: [pushSubscriptions.adminId], references: [admins.id] }),
}));
