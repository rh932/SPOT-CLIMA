import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

/**
 * Jornada do colaborador de ponta a ponta, com banco de verdade.
 *
 * Roda as rotas reais (avaliar, consultar ficha, listar equipe, registrar saída)
 * contra um Postgres DESCARTÁVEL. Fica desligado por padrão: só roda com
 * `TEST_DATABASE_URL` apontando para um banco local com as migrações aplicadas
 * (`npm run db:migrate` com DATABASE_URL apontando para ele). Recusa qualquer
 * endereço que não seja localhost, para nunca encostar no banco de produção.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres \
 *     npx vitest run tests/integracao
 *
 * Cobre os cenários A–F do pedido de feedbacks: prazos 30/120/180, histórico
 * que só cresce, contador 1º..4º, desligamento sem perda e experiência 45+45
 * intacta.
 */

const URL_TESTE = process.env.TEST_DATABASE_URL;
const ehLocal = Boolean(URL_TESTE && /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(URL_TESTE));
const rodar = ehLocal ? describe : describe.skip;

process.env.AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
if (ehLocal) {
  process.env.DATABASE_URL = URL_TESTE!;
  process.env.PG_POOL_MAX = '1';
}

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
  }),
}));

// Dia de calendário -> meio-dia UTC (o mesmo formato que a tela manda).
const dia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const isoDia = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const somar = (iso: string, dias: number) => isoDia(new Date(dia(iso).getTime() + dias * 86400000));

type Ctx = {
  db: typeof import('../../src/db').db;
  schema: typeof import('../../src/db/schema');
  evaluate: typeof import('../../src/app/api/gestor/employees/[id]/evaluate/route').POST;
  ficha: typeof import('../../src/app/api/gestor/employees/[id]/route').GET;
  lista: typeof import('../../src/app/api/gestor/employees/route').GET;
  saida: typeof import('../../src/app/api/gestor/employees/[id]/termination/route').POST;
  tokens: { gestor: string; lider: string };
  ids: { sector: string; unit: string };
  dims: Record<string, unknown>;
};
let c: Ctx;

const req = (url: string, method: 'GET' | 'POST', cookieToken: string, body?: unknown) =>
  new NextRequest(`https://spot.test${url}`, {
    method,
    headers: new Headers({ host: 'spot.test', 'content-type': 'application/json', origin: 'https://spot.test' }),
    body: body ? JSON.stringify(body) : undefined,
  });

function como(token: string) {
  cookieJar.clear();
  cookieJar.set('spot_gestor_session', token);
}

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

function corpoFeedback(over: Record<string, unknown>) {
  return {
    ...c.dims,
    dueDateAtEvaluation: new Date().toISOString(),
    favorableAspects: 'Bom atendimento e pontualidade.',
    unfavorableAspects: 'Precisa melhorar a comunicação.',
    classification: 'OTIMAS_PERSPECTIVAS',
    ...over,
  };
}

async function novoColaborador(over: Record<string, unknown>) {
  const [e] = await c.db.insert(c.schema.probationaryEmployees).values({
    fullName: 'Colaborador ' + Math.random().toString(36).slice(2, 7),
    admissionDate: dia('2025-03-03'),
    roleDescription: 'Garçom',
    sectorId: c.ids.sector,
    unitId: c.ids.unit,
    shift: 'DIA',
    period1DueDate: dia('2025-04-16'),
    period2DueDate: dia('2025-05-31'),
    status: 'HIRED',
    track: 'ATIVO',
    ...over,
  } as never).returning();
  return e;
}

async function feedback(empId: string, data: string, color: string, extra: Record<string, unknown> = {}) {
  como(c.tokens.gestor);
  const res = await c.evaluate(
    req(`/api/gestor/employees/${empId}/evaluate`, 'POST', c.tokens.gestor,
      corpoFeedback({ evaluationDate: dia(data).toISOString(), color, ...extra })),
    contexto(empId),
  );
  return { res, json: await res.json() };
}

rodar('jornada do colaborador (banco real, descartável)', () => {
  beforeAll(async () => {
    const [{ db }, schema, { createSessionToken, hashPassword }, bank] = await Promise.all([
      import('../../src/db'), import('../../src/db/schema'), import('../../src/lib/auth'), import('../../src/data/evaluationBank'),
    ]);
    const [unit] = await db.insert(schema.units).values({ name: 'Unidade Teste ' + Date.now() }).returning();
    const [sector] = await db.insert(schema.sectors).values({ name: 'Setor Teste ' + Date.now(), usesColorCycle: true, usesFeedback: true }).returning();
    const hash = await hashPassword('senha-de-teste-123');
    const criar = async (role: 'GESTOR' | 'GESTOR_LIDER', nome: string) => {
      const [a] = await db.insert(schema.admins).values({ email: `${nome}-${Date.now()}@teste.local`, passwordHash: hash, name: nome, role }).returning();
      await db.insert(schema.adminUnits).values({ adminId: a.id, unitId: unit.id });
      await db.insert(schema.adminSectors).values({ adminId: a.id, sectorId: sector.id });
      await db.insert(schema.adminShifts).values([{ adminId: a.id, shift: 'DIA' }, { adminId: a.id, shift: 'NOITE' }]);
      return createSessionToken({ adminId: a.id, email: a.email, name: a.name, role }, hash);
    };
    const gestor = await criar('GESTOR', 'gestor');
    const lider = await criar('GESTOR_LIDER', 'lider');

    const sub = (dim: 'flexibility' | 'interest' | 'relationship' | 'learning') =>
      Object.fromEntries(bank.EVALUATION_DIMENSIONS.find((d) => d.key === dim)!.subQuestions.map((q) => [q.key, 'SIM']));
    const dims = {
      flexibilityRating: 'BOM', flexibilitySubAnswers: sub('flexibility'),
      interestRating: 'BOM', interestSubAnswers: { ...sub('interest'), q3_v2: 'MEDIO' },
      relationshipRating: 'BOM', relationshipSubAnswers: sub('relationship'),
      learningRating: 'BOM', learningSubAnswers: sub('learning'),
    };

    const [evaluate, ficha, lista, saida] = await Promise.all([
      import('../../src/app/api/gestor/employees/[id]/evaluate/route').then((m) => m.POST),
      import('../../src/app/api/gestor/employees/[id]/route').then((m) => m.GET),
      import('../../src/app/api/gestor/employees/route').then((m) => m.GET),
      import('../../src/app/api/gestor/employees/[id]/termination/route').then((m) => m.POST),
    ]);
    c = { db, schema, evaluate, ficha, lista, saida, tokens: { gestor, lider }, ids: { sector: sector.id, unit: unit.id }, dims };
  }, 60000);

  afterAll(async () => { /* o banco é descartável: nada a limpar */ });

  it('Cenário A: vermelho agenda em 30 dias (e não 45); o 2º feedback não toca o 1º', async () => {
    const e = await novoColaborador({});
    const primeiro = await feedback(e.id, '2026-01-05', 'VERMELHO');
    expect(primeiro.res.status).toBe(201);
    expect(primeiro.json.evaluation.cycleNumber).toBe(1);
    expect(isoDia(primeiro.json.nextFeedbackDueDate)).toBe('2026-02-04'); // 05/01 + 30 dias

    const antes = await c.db.query.performanceEvaluations.findFirst({ where: (t, { eq }) => eq(t.id, primeiro.json.evaluation.id) });

    const segundo = await feedback(e.id, '2026-02-04', 'AMARELO', { favorableAspects: 'Evoluiu bastante.' });
    expect(segundo.res.status).toBe(201);
    expect(segundo.json.evaluation.cycleNumber).toBe(2);
    expect(isoDia(segundo.json.nextFeedbackDueDate)).toBe('2026-06-04'); // 04/02 + 120 dias

    // O primeiro continua idêntico, linha por linha.
    const depois = await c.db.query.performanceEvaluations.findFirst({ where: (t, { eq }) => eq(t.id, primeiro.json.evaluation.id) });
    expect(depois).toEqual(antes);
    expect(depois!.color).toBe('VERMELHO');
    expect(isoDia(depois!.nextDueDate!)).toBe('2026-02-04');

    // O colaborador reflete só o mais recente.
    const row = await c.db.query.probationaryEmployees.findFirst({ where: (t, { eq }) => eq(t.id, e.id) });
    expect(row!.currentColor).toBe('AMARELO');
    expect(isoDia(row!.nextFeedbackDueDate!)).toBe('2026-06-04');
  });

  it('Cenários B e C: amarelo em 120 dias e verde em 180 dias, contados da data do feedback', async () => {
    const amarelo = await feedback((await novoColaborador({})).id, '2026-03-10', 'AMARELO');
    expect(isoDia(amarelo.json.nextFeedbackDueDate)).toBe(somar('2026-03-10', 120));
    const verde = await feedback((await novoColaborador({})).id, '2026-03-10', 'VERDE');
    expect(isoDia(verde.json.nextFeedbackDueDate)).toBe(somar('2026-03-10', 180));
    // A admissão (2025) não entra na conta.
    expect(isoDia(amarelo.json.nextFeedbackDueDate)).not.toBe(somar('2025-03-03', 120));
  });

  it('Cenário D: quatro feedbacks em sequência, todos preservados e abertos um a um', async () => {
    const e = await novoColaborador({});
    const cores = ['VERMELHO', 'AMARELO', 'VERDE', 'VERMELHO'];
    const datas = ['2026-01-05', '2026-02-04', '2026-06-04', '2026-11-10'];
    const criados: { id: string; cor: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await feedback(e.id, datas[i], cores[i]);
      expect(r.res.status).toBe(201);
      expect(r.json.evaluation.cycleNumber).toBe(i + 1);
      criados.push({ id: r.json.evaluation.id, cor: cores[i] });
    }

    como(c.tokens.gestor);
    const fichaRes = await c.ficha(req(`/api/gestor/employees/${e.id}`, 'GET', c.tokens.gestor), contexto(e.id));
    const { evaluations } = await fichaRes.json();
    const feedbacks = evaluations.filter((x: { period: string }) => x.period === 'FEEDBACK');
    expect(feedbacks.map((x: { cycleNumber: number }) => x.cycleNumber)).toEqual([1, 2, 3, 4]);
    // A classificação de cada momento ficou como foi dada, mesmo com a cor atual diferente.
    expect(feedbacks.map((x: { color: string }) => x.color)).toEqual(cores);
    expect(feedbacks.every((x: { createdAt: string; evaluator: { name: string } }) => x.createdAt && x.evaluator.name === 'gestor')).toBe(true);
    // Cada um abre individualmente, com as respostas originais (inclui "Médio").
    for (const f of criados) {
      const um = feedbacks.find((x: { id: string }) => x.id === f.id);
      expect(um.interestSubAnswers.q3_v2).toBe('MEDIO');
      expect(um.favorableAspects).toBe('Bom atendimento e pontualidade.');
    }
  });

  it('Cenário D (bônus): "Médio" só vale onde o formulário oferece', async () => {
    const e = await novoColaborador({});
    const ruim = await feedback(e.id, '2026-01-05', 'VERDE', {
      flexibilitySubAnswers: { ...(c.dims.flexibilitySubAnswers as object), q2: 'MEDIO' },
    });
    expect(ruim.res.status).toBe(400);
    const antiga = await feedback(e.id, '2026-01-05', 'VERDE', {
      interestSubAnswers: { q1: 'SIM', q2: 'SIM', q3: 'SIM' }, // pergunta antiga, já substituída
    });
    expect(antiga.res.status).toBe(400);
    const asVezes = await feedback(e.id, '2026-01-05', 'VERDE', {
      interestSubAnswers: { q1: 'SIM', q2: 'SIM', q3_v2: 'AS_VEZES' },
    });
    expect(asVezes.res.status).toBe(201);
  });

  it('Cenário E: desligar tira da equipe ativa e das pendências, e o histórico fica completo', async () => {
    const e = await novoColaborador({});
    await feedback(e.id, '2026-01-05', 'VERMELHO');
    await feedback(e.id, '2026-02-04', 'AMARELO');

    como(c.tokens.lider);
    const res = await c.saida(
      req(`/api/gestor/employees/${e.id}/termination`, 'POST', c.tokens.lider, { reason: 'PEDIDO_DEMISSAO', date: dia('2026-03-01').toISOString(), notes: 'Mudou de cidade' }),
      contexto(e.id),
    );
    expect(res.status).toBe(200);

    const row = await c.db.query.probationaryEmployees.findFirst({ where: (t, { eq }) => eq(t.id, e.id) });
    expect(row!.status).toBe('TERMINATED');
    expect(row!.terminationReason).toBe('PEDIDO_DEMISSAO');

    // Lista da equipe: ele vem como TERMINATED (a tela o separa na aba Desligados) e fora do ciclo.
    como(c.tokens.lider);
    const listaRes = await c.lista(req('/api/gestor/employees', 'GET', c.tokens.lider));
    const { employees } = await listaRes.json();
    const dele = employees.find((x: { id: string }) => x.id === e.id);
    expect(dele.status).toBe('TERMINATED');
    expect(employees.filter((x: { status: string }) => x.status !== 'TERMINATED').some((x: { id: string }) => x.id === e.id)).toBe(false);

    // A rotina de lembretes só olha quem está HIRED / em experiência: ele não entra.
    const { and, eq, inArray } = await import('drizzle-orm');
    const candidatos = await c.db.query.probationaryEmployees.findMany({
      where: and(eq(c.schema.probationaryEmployees.id, e.id), inArray(c.schema.probationaryEmployees.status, ['HIRED', 'AWAITING_PERIOD_1', 'AWAITING_PERIOD_2'])),
    });
    expect(candidatos).toHaveLength(0);

    // A ficha completa continua abrindo, com os dois feedbacks.
    const fichaRes = await c.ficha(req(`/api/gestor/employees/${e.id}`, 'GET', c.tokens.lider), contexto(e.id));
    expect(fichaRes.status).toBe(200);
    const ficha = await fichaRes.json();
    expect(ficha.evaluations.filter((x: { period: string }) => x.period === 'FEEDBACK')).toHaveLength(2);
    expect(ficha.employee.terminationReason).toBe('PEDIDO_DEMISSAO');

    // Desligado não recebe novas avaliações.
    como(c.tokens.gestor);
    const nova = await feedback(e.id, '2026-03-02', 'VERDE');
    expect(nova.res.status).toBe(409);
  });

  it('Cenário F: experiência 45 + 45 dias segue intacta e o feedback começa em 1º, à parte', async () => {
    const adm = '2026-02-02';
    const e = await novoColaborador({
      track: 'NOVO', status: 'AWAITING_PERIOD_1', admissionDate: dia(adm),
      period1DueDate: dia(somar(adm, 44)), period2DueDate: dia(somar(adm, 89)),
    });

    // 1º prazo: estender (+45).
    como(c.tokens.gestor);
    const p1 = await c.evaluate(
      req(`/api/gestor/employees/${e.id}/evaluate`, 'POST', c.tokens.gestor,
        corpoFeedback({ evaluationDate: dia(somar(adm, 40)).toISOString(), conclusion: 'EXTENDER' })),
      contexto(e.id),
    );
    expect(p1.status).toBe(201);
    const j1 = await p1.json();
    expect(j1.evaluation.period).toBe('FIRST');
    expect(j1.evaluation.color).toBeNull();
    expect(j1.evaluation.nextDueDate).toBeNull(); // experiência não gera prazo de feedback
    expect(j1.employeeStatus).toBe('AWAITING_PERIOD_2');

    // 2º prazo: efetivar, e é aqui que a cor nasce.
    const p2 = await c.evaluate(
      req(`/api/gestor/employees/${e.id}/evaluate`, 'POST', c.tokens.gestor,
        corpoFeedback({ evaluationDate: dia(somar(adm, 85)).toISOString(), conclusion: 'EFETIVAR', color: 'VERMELHO' })),
      contexto(e.id),
    );
    expect(p2.status).toBe(201);
    const j2 = await p2.json();
    expect(j2.evaluation.period).toBe('SECOND');
    expect(j2.employeeStatus).toBe('HIRED');
    expect(isoDia(j2.nextFeedbackDueDate)).toBe(somar(somar(adm, 85), 30)); // 30 dias do dia da avaliação

    // Prazos de experiência não foram mexidos.
    const row = await c.db.query.probationaryEmployees.findFirst({ where: (t, { eq }) => eq(t.id, e.id) });
    expect(isoDia(row!.period1DueDate)).toBe(somar(adm, 44));
    expect(isoDia(row!.period2DueDate)).toBe(somar(adm, 89));

    // O primeiro feedback é o 1º, mesmo com duas avaliações de experiência antes.
    const f = await feedback(e.id, isoDia(new Date()), 'VERDE');
    expect(f.res.status).toBe(201);
    expect(f.json.evaluation.period).toBe('FEEDBACK');
    expect(f.json.evaluation.cycleNumber).toBe(1);
  });

  it('migração 0030: corrige só o vermelho agendado com 45 dias e não desloca duas vezes', async () => {
    const { sql } = await import('drizzle-orm');
    const antigo = await novoColaborador({ currentColor: 'VERMELHO', nextFeedbackDueDate: dia('2026-02-19') });
    const [ev] = await c.db.insert(c.schema.performanceEvaluations).values({
      employeeId: antigo.id, period: 'FEEDBACK', cycleNumber: 1, evaluationDate: dia('2026-01-05'), dueDateAtEvaluation: dia('2026-01-05'),
      favorableAspects: 'a', unfavorableAspects: 'b', classification: 'OTIMAS_PERSPECTIVAS', color: 'VERMELHO', nextDueDate: dia('2026-02-19'),
    }).returning();
    const certo = await novoColaborador({ currentColor: 'VERMELHO', nextFeedbackDueDate: dia('2026-02-04') }); // já em 30 dias
    await c.db.insert(c.schema.performanceEvaluations).values({
      employeeId: certo.id, period: 'FEEDBACK', cycleNumber: 1, evaluationDate: dia('2026-01-05'), dueDateAtEvaluation: dia('2026-01-05'),
      favorableAspects: 'a', unfavorableAspects: 'b', classification: 'OTIMAS_PERSPECTIVAS', color: 'VERMELHO', nextDueDate: dia('2026-02-04'),
    });

    const arquivo = fs.readFileSync(path.join(process.cwd(), 'drizzle', '0030_feedback_vermelho_30_dias.sql'), 'utf8');
    const passos = arquivo.split('--> statement-breakpoint');
    for (let vez = 0; vez < 2; vez++) {
      for (const passo of passos) await c.db.execute(sql.raw(passo));
    }

    const a = await c.db.query.probationaryEmployees.findFirst({ where: (t, { eq }) => eq(t.id, antigo.id) });
    const b = await c.db.query.probationaryEmployees.findFirst({ where: (t, { eq }) => eq(t.id, certo.id) });
    expect(isoDia(a!.nextFeedbackDueDate!)).toBe('2026-02-04'); // 45 -> 30 dias, uma vez só
    expect(isoDia(b!.nextFeedbackDueDate!)).toBe('2026-02-04'); // já estava certo, ficou
    const evA = await c.db.query.performanceEvaluations.findFirst({ where: (t, { eq }) => eq(t.id, ev.id) });
    expect(isoDia(evA!.nextDueDate!)).toBe('2026-02-04');
    expect(evA!.color).toBe('VERMELHO'); // a classificação do dia não muda
    expect(isoDia(evA!.evaluationDate)).toBe('2026-01-05');
  });
});
