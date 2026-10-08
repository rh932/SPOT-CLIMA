/**
 * Seed de demonstração do SPOT CLIMA.
 *
 * Cria: admin de demo, setores, unidades, dimensões, uma pesquisa "fechada" com dados
 * fictícios (para já nascer com histórico) e uma pesquisa "aberta" vazia
 * pronta para testes manuais, além de alguns planos de ação de exemplo.
 *
 * IMPORTANTE: gera exclusivamente dados fictícios. Nunca rode este script
 * apontando para um banco de produção com dados reais.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DIMENSIONS_SEED, SECTORS_SEED, UNITS_SEED } from '../data/surveyBank';
import { hashPassword } from '../lib/password';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// PRNG determinístico (mulberry32) para que o seed seja reproduzível entre execuções.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260915);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickMany<T>(arr: readonly T[], min: number, max: number): T[] {
  const n = randInt(min, Math.min(max, arr.length));
  const shuffled = [...arr].sort(() => rand() - 0.5);
  return shuffled.slice(0, n);
}

/** Gera um valor Likert 1-5 enviesado por uma "favorabilidade alvo" (0 a 1). */
function biasedLikert(targetFavorability: number): number {
  // targetFavorability alto -> distribuição deslocada para 4-5
  const r = rand();
  const centered = 3 + (targetFavorability - 0.65) * 5.5 + (r - 0.5) * 2.4;
  const value = Math.round(Math.min(5, Math.max(1, centered)));
  return value;
}

// Viés por setor x dimensão, calibrado para produzir um heatmap com variação
// realista (Administração mais forte, Cozinha e Delivery com mais pontos de atenção).
const SECTOR_DIMENSION_BIAS: Record<string, Record<string, number>> = {
  'Administração': {
    lideranca: 0.88, desenvolvimento: 0.82, comunicacao: 0.8, colaboracao: 0.84,
    reconhecimento: 0.78, 'bem-estar': 0.8, flexibilidade: 0.82, inclusao: 0.86, experiencia: 0.85,
  },
  'Salão - Bar': {
    lideranca: 0.8, desenvolvimento: 0.7, comunicacao: 0.75, colaboracao: 0.78,
    reconhecimento: 0.68, 'bem-estar': 0.72, flexibilidade: 0.66, inclusao: 0.78, experiencia: 0.76,
  },
  'Salão - Atendimento': {
    lideranca: 0.76, desenvolvimento: 0.66, comunicacao: 0.7, colaboracao: 0.74,
    reconhecimento: 0.63, 'bem-estar': 0.68, flexibilidade: 0.6, inclusao: 0.74, experiencia: 0.72,
  },
  'Delivery': {
    lideranca: 0.72, desenvolvimento: 0.58, comunicacao: 0.62, colaboracao: 0.68,
    reconhecimento: 0.56, 'bem-estar': 0.6, flexibilidade: 0.7, inclusao: 0.7, experiencia: 0.65,
  },
  'Cozinha': {
    lideranca: 0.63, desenvolvimento: 0.5, comunicacao: 0.55, colaboracao: 0.6,
    reconhecimento: 0.5, 'bem-estar': 0.52, flexibilidade: 0.48, inclusao: 0.66, experiencia: 0.58,
  },
};

const SAMPLE_COMMENTS = {
  elogio: [
    'Gosto muito do ambiente da equipe, todo mundo se ajuda bastante.',
    'Meu líder é muito atencioso e sempre me dá feedback bom.',
    'Estou satisfeito com os benefícios e o clima entre os colegas.',
    'A cozinha tem uma equipe muito unida, isso ajuda demais no dia a dia.',
    'Acho ótimo que a empresa se preocupa com treinamento.',
  ],
  reclamacao: [
    'A escala muda em cima da hora e isso atrapalha minha vida pessoal.',
    'Falta comunicação sobre mudanças importantes, ficamos sabendo por último.',
    'Sinto que o reconhecimento não é justo entre os setores.',
    'A jornada é muito puxada na cozinha, sem tempo de descanso adequado.',
    'Os equipamentos da cozinha estão desatualizados e atrapalham o trabalho.',
    'Sinto falta de um plano de carreira mais claro.',
  ],
  sugestao: [
    'Poderia ter mais treinamentos técnicos para quem está na cozinha.',
    'Sugiro criar reuniões rápidas semanais para alinhar as equipes.',
    'Seria bom ter um canal oficial só para avisos importantes, tipo um mural digital.',
    'Gostaria que houvesse mais oportunidades de mentoria entre setores.',
    'Poderiam melhorar a comunicação entre líderes e equipe do delivery.',
  ],
};

async function main() {
  console.log('Seed: iniciando...');

  // --- Admin de demonstração -------------------------------------------------
  const demoEmail = process.env.DEMO_ADMIN_EMAIL ?? 'rh@restaurantespot.com.br';
  const demoPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!demoPassword) {
    throw new Error('Defina DEMO_ADMIN_PASSWORD no .env antes de rodar o seed.');
  }
  const passwordHash = await hashPassword(demoPassword);

  const [admin] = await db
    .insert(schema.admins)
    .values({ email: demoEmail, passwordHash, name: 'RH Spot (Demo)', role: 'SUPER_ADMIN' })
    .onConflictDoNothing({ target: schema.admins.email })
    .returning();

  const adminRow = admin ?? (await db.query.admins.findFirst({ where: (a, { eq }) => eq(a.email, demoEmail) }));
  if (!adminRow) throw new Error('Não foi possível criar/encontrar o admin de demonstração.');
  console.log(`Seed: admin "${adminRow.email}" pronto.`);

  // --- Setores -----------------------------------------------------------
  const sectorRows: Record<string, typeof schema.sectors.$inferSelect> = {};
  for (const s of SECTORS_SEED) {
    const [row] = await db
      .insert(schema.sectors)
      .values({ name: s.name, order: s.order, usesColorCycle: s.usesColorCycle })
      .onConflictDoNothing({ target: schema.sectors.name })
      .returning();
    sectorRows[s.name] = row ?? (await db.query.sectors.findFirst({ where: (t, { eq }) => eq(t.name, s.name) }))!;
  }
  console.log(`Seed: ${Object.keys(sectorRows).length} setores prontos.`);

  // --- Unidades ------------------------------------------------------------
  const unitRows: (typeof schema.units.$inferSelect)[] = [];
  for (const u of UNITS_SEED) {
    const [row] = await db
      .insert(schema.units)
      .values({ name: u.name, order: u.order })
      .onConflictDoNothing({ target: schema.units.name })
      .returning();
    unitRows.push(row ?? (await db.query.units.findFirst({ where: (t, { eq }) => eq(t.name, u.name) }))!);
  }
  console.log(`Seed: ${unitRows.length} unidades prontas.`);

  // --- Dimensões -----------------------------------------------------------
  const dimensionRows: Record<string, typeof schema.dimensions.$inferSelect> = {};
  for (const d of DIMENSIONS_SEED) {
    const [row] = await db
      .insert(schema.dimensions)
      .values({ name: d.name, description: d.description, order: d.order })
      .onConflictDoNothing({ target: schema.dimensions.name })
      .returning();
    dimensionRows[d.key] =
      row ?? (await db.query.dimensions.findFirst({ where: (t, { eq }) => eq(t.name, d.name) }))!;
  }
  console.log(`Seed: ${Object.keys(dimensionRows).length} dimensões prontas.`);

  const dimensionIdToKey = new Map<string, string>();
  for (const [key, row] of Object.entries(dimensionRows)) {
    dimensionIdToKey.set(row.id, key);
  }

  // --- Categorias de modelo + modelo padrão (biblioteca de modelos) --------
  const TEMPLATE_CATEGORY_NAMES = [
    'Engajamento', 'Clima organizacional', 'Plano de carreira', 'Avaliação de desempenho',
    'Efetividade da liderança', 'Comunicação interna', 'Cultura organizacional', 'Gestão',
    'Benefícios', 'Reconhecimento', 'Desenvolvimento profissional', 'Segurança psicológica',
    'Satisfação geral', 'Personalizado',
  ];
  const templateCategoryRows: Record<string, typeof schema.templateCategories.$inferSelect> = {};
  for (const [idx, name] of TEMPLATE_CATEGORY_NAMES.entries()) {
    const [row] = await db
      .insert(schema.templateCategories)
      .values({ name, order: idx + 1 })
      .onConflictDoNothing({ target: schema.templateCategories.name })
      .returning();
    templateCategoryRows[name] =
      row ?? (await db.query.templateCategories.findFirst({ where: (t, { eq }) => eq(t.name, name) }))!;
  }
  console.log(`Seed: ${Object.keys(templateCategoryRows).length} categorias de modelo prontas.`);

  const DEFAULT_TEMPLATE_NAME = 'Modelo Padrão SPOT CLIMA';
  const existingDefaultTemplate = await db.query.questionTemplates.findFirst({
    where: (t, { eq }) => eq(t.name, DEFAULT_TEMPLATE_NAME),
  });
  if (!existingDefaultTemplate) {
    const [defaultTemplate] = await db
      .insert(schema.questionTemplates)
      .values({
        name: DEFAULT_TEMPLATE_NAME,
        description: 'Banco inicial de 73 perguntas / 9 dimensões usado historicamente pelo SPOT CLIMA.',
        categoryId: templateCategoryRows['Clima organizacional'].id,
      })
      .returning();

    let templateOrder = 0;
    for (const dim of DIMENSIONS_SEED) {
      for (const q of dim.questions) {
        templateOrder += 1;
        const [insertedTQ] = await db
          .insert(schema.templateQuestions)
          .values({
            templateId: defaultTemplate.id,
            dimensionId: dimensionRows[dim.key].id,
            text: q.text,
            type: q.type,
            required: q.required,
            order: templateOrder,
          })
          .returning();
        if (q.options) {
          await db.insert(schema.templateQuestionOptions).values(
            q.options.map((label, idx) => ({ templateQuestionId: insertedTQ.id, label, order: idx }))
          );
        }
      }
    }
    console.log(`Seed: modelo "${DEFAULT_TEMPLATE_NAME}" criado com ${templateOrder} perguntas.`);
  } else {
    console.log(`Seed: modelo "${DEFAULT_TEMPLATE_NAME}" já existia, nada a fazer.`);
  }

  // --- Distribuição fictícia de colaboradores elegíveis por setor --------
  const POPULATION: Record<string, number> = {
    'Delivery': 40, 'Salão - Bar': 30, 'Salão - Atendimento': 50, 'Administração': 20, 'Cozinha': 60,
  };
  const TOTAL_POPULATION = Object.values(POPULATION).reduce((a, b) => a + b, 0); // 200

  // ==========================================================================
  // PESQUISA 1 — Encerrada, com respostas fictícias (histórico)
  // ==========================================================================
  const [closedSurvey] = await db
    .insert(schema.surveys)
    .values({
      name: 'Pesquisa de Clima - Setembro/2025',
      description: 'Primeira aplicação da pesquisa de clima organizacional do Spot.',
      status: 'CLOSED',
      openDate: new Date('2025-09-15T09:00:00-03:00'),
      closeDate: new Date('2025-09-30T23:59:59-03:00'),
      eligiblePopulation: TOTAL_POPULATION,
      anonymityThreshold: 5,
      suggestedNextSurvey: new Date('2026-03-15T09:00:00-03:00'),
    })
    .returning();
  console.log(`Seed: pesquisa "${closedSurvey.name}" criada.`);

  const closedQuestions = await insertQuestions(closedSurvey.id, dimensionRows);

  // Participação: ~86% de resposta (172 de 200), variando um pouco por setor.
  const PARTICIPATION_RATE: Record<string, number> = {
    'Delivery': 0.8, 'Salão - Bar': 0.9, 'Salão - Atendimento': 0.86, 'Administração': 0.95, 'Cozinha': 0.83,
  };

  let unitCursor = 0;
  for (const sectorName of Object.keys(POPULATION)) {
    const respondents = Math.round(POPULATION[sectorName] * PARTICIPATION_RATE[sectorName]);
    for (let i = 0; i < respondents; i++) {
      const unitId = unitRows[unitCursor % unitRows.length].id;
      unitCursor++;
      await createFakeResponse(closedSurvey.id, sectorRows[sectorName].id, unitId, closedQuestions, sectorName, dimensionIdToKey);
    }
  }
  console.log('Seed: respostas fictícias da pesquisa encerrada geradas.');

  // ==========================================================================
  // PESQUISA 2 — Aberta agora, ainda sem respostas (para o fluxo do colaborador)
  // ==========================================================================
  const [openSurvey] = await db
    .insert(schema.surveys)
    .values({
      name: 'Pesquisa de Clima - Março/2026',
      description: 'Segunda aplicação da pesquisa de clima organizacional do Spot.',
      status: 'OPEN',
      openDate: new Date(),
      closeDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      eligiblePopulation: TOTAL_POPULATION,
      anonymityThreshold: 5,
      duplicatedFromId: closedSurvey.id,
    })
    .returning();
  console.log(`Seed: pesquisa "${openSurvey.name}" criada (aberta).`);
  await insertQuestions(openSurvey.id, dimensionRows);

  // Algumas respostas parciais na pesquisa aberta, para o dashboard "ao vivo" não ficar vazio.
  for (const sectorName of Object.keys(POPULATION)) {
    const partial = Math.round(POPULATION[sectorName] * 0.25);
    const qs = await db.query.questions.findMany({ where: (q, { eq }) => eq(q.surveyId, openSurvey.id) });
    for (let i = 0; i < partial; i++) {
      const unitId = unitRows[unitCursor % unitRows.length].id;
      unitCursor++;
      await createFakeResponse(openSurvey.id, sectorRows[sectorName].id, unitId, qs, sectorName, dimensionIdToKey);
    }
  }
  console.log('Seed: respostas parciais da pesquisa aberta geradas.');

  // --- Planos de ação fictícios -------------------------------------------
  await db.insert(schema.actionPlans).values([
    {
      surveyId: closedSurvey.id,
      problem: 'Comunicação interna com baixa favorabilidade na Cozinha e no Delivery.',
      dimensionId: dimensionRows['comunicacao'].id,
      sectorId: sectorRows['Cozinha'].id,
      priority: 'HIGH',
      action: 'Criar quadro de avisos digital e reunião rápida semanal por turno.',
      owner: 'RH + Gerência de Cozinha',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'IN_PROGRESS',
      notes: 'Piloto iniciado no turno da noite.',
      createdById: adminRow.id,
    },
    {
      surveyId: closedSurvey.id,
      problem: 'Baixo índice de Desenvolvimento e Carreira no setor Delivery.',
      dimensionId: dimensionRows['desenvolvimento'].id,
      sectorId: sectorRows['Delivery'].id,
      priority: 'MEDIUM',
      action: 'Estruturar trilha de treinamento inicial e programa de mentoria entre entregadores sênior e novatos.',
      owner: 'RH',
      dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      status: 'NOT_STARTED',
      createdById: adminRow.id,
    },
    {
      surveyId: closedSurvey.id,
      problem: 'Reconhecimento percebido como pouco transparente.',
      dimensionId: dimensionRows['reconhecimento'].id,
      sectorId: null,
      priority: 'CRITICAL',
      action: 'Publicar critérios de promoção e aumento salarial em documento acessível a todos.',
      owner: 'Diretoria + RH',
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // já vencido, para testar alerta de atraso
      status: 'IN_PROGRESS',
      createdById: adminRow.id,
    },
  ]);
  console.log('Seed: planos de ação fictícios criados.');

  console.log('Seed concluído com sucesso.');
  await pool.end();
}

async function insertQuestions(
  surveyId: string,
  dimensionRows: Record<string, typeof schema.dimensions.$inferSelect>
) {
  const allQuestions: typeof schema.questions.$inferSelect[] = [];
  let order = 0;
  for (const dim of DIMENSIONS_SEED) {
    for (const q of dim.questions) {
      order += 1;
      const [inserted] = await db
        .insert(schema.questions)
        .values({
          surveyId,
          dimensionId: dimensionRows[dim.key].id,
          text: q.text,
          type: q.type,
          required: q.required,
          order,
        })
        .returning();
      if (q.options) {
        await db.insert(schema.questionOptions).values(
          q.options.map((label, idx) => ({ questionId: inserted.id, label, order: idx }))
        );
      }
      allQuestions.push(inserted);
    }
  }
  return allQuestions;
}

async function createFakeResponse(
  surveyId: string,
  sectorId: string,
  unitId: string,
  questions: typeof schema.questions.$inferSelect[],
  sectorName: string,
  dimensionIdToKey: Map<string, string>
) {
  const [response] = await db.insert(schema.surveyResponses).values({ surveyId, sectorId, unitId }).returning();

  const answers: (typeof schema.responseAnswers.$inferInsert)[] = [];

  for (const question of questions) {
    if (question.type === 'LIKERT') {
      const dimKey = (question.dimensionId && dimensionIdToKey.get(question.dimensionId)) || 'experiencia';
      const bias = SECTOR_DIMENSION_BIAS[sectorName]?.[dimKey] ?? 0.7;
      // Nem todo mundo responde perguntas opcionais, mas Likert é sempre obrigatória no banco padrão.
      answers.push({ responseId: response.id, questionId: question.id, numericValue: biasedLikert(bias) });
    } else if (question.type === 'SINGLE_CHOICE') {
      if (!question.required && rand() < 0.35) continue; // opcional, parte pula
      const options = await optionsFor(question.id);
      if (options.length === 0) continue;
      answers.push({ responseId: response.id, questionId: question.id, choiceValues: [pick(options).label] });
    } else if (question.type === 'MULTIPLE_CHOICE') {
      if (!question.required && rand() < 0.4) continue;
      const options = await optionsFor(question.id);
      if (options.length === 0) continue;
      const chosen = pickMany(options.map((o) => o.label), 1, 3);
      answers.push({ responseId: response.id, questionId: question.id, choiceValues: chosen });
    } else {
      // SHORT_TEXT / LONG_TEXT — a maioria dos colaboradores pula perguntas abertas opcionais.
      if (rand() < 0.72) continue;
      const bucket = pick(['elogio', 'reclamacao', 'sugestao'] as const);
      answers.push({ responseId: response.id, questionId: question.id, textValue: pick(SAMPLE_COMMENTS[bucket]) });
    }
  }

  if (answers.length > 0) {
    await db.insert(schema.responseAnswers).values(answers);
  }
}

const optionsCache = new Map<string, { label: string }[]>();
async function optionsFor(questionId: string) {
  if (optionsCache.has(questionId)) return optionsCache.get(questionId)!;
  const rows = await db.query.questionOptions.findMany({ where: (o, { eq }) => eq(o.questionId, questionId) });
  optionsCache.set(questionId, rows);
  return rows;
}

main().catch((err) => {
  console.error('Seed falhou:', err);
  process.exit(1);
});
