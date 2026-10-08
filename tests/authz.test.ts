import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';

/**
 * Autenticação e autorização exercitadas de verdade: o middleware, as
 * funções requireAdmin/requireGestor e alguns handlers reais são chamados
 * com um banco simulado (sem Postgres). Cada teste tenta fazer algo que a
 * pessoa NÃO pode e confere que a resposta é 401/403 — nunca os dados.
 */

process.env.AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';

// --- Banco e cookies simulados ------------------------------------------------

const state = vi.hoisted(() => ({
  admins: new Map<string, Record<string, unknown>>(),
  employee: null as Record<string, unknown> | null,
  survey: null as Record<string, unknown> | null,
  cookies: new Map<string, string>(),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => state.cookies.set(name, value),
  }),
}));

vi.mock('@/db', () => {
  const empty = () => Promise.resolve([]);
  const chain: Record<string, unknown> = {};
  for (const m of ['values', 'onConflictDoUpdate', 'returning', 'where', 'set', 'from']) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown[]) => void) => resolve([]);
  return {
    db: {
      query: {
        // O id do admin vem do token; o mock devolve a conta cadastrada no teste.
        admins: { findFirst: () => Promise.resolve(state.admins.get('current') ?? undefined) },
        units: { findMany: empty },
        sectors: { findMany: empty },
        probationaryEmployees: { findFirst: () => Promise.resolve(state.employee ?? undefined) },
        surveys: { findFirst: () => Promise.resolve(state.survey ?? undefined) },
        questions: { findMany: empty },
        surveyResponses: { findMany: empty },
        responseAnswers: { findMany: empty },
        performanceEvaluations: { findMany: empty },
        employeeColorChanges: { findMany: empty },
        trainings: { findMany: empty },
      },
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      transaction: (fn: (tx: unknown) => unknown) => fn({ insert: () => chain }),
    },
  };
});

const { createSessionToken, hashPassword } = await import('../src/lib/auth');
const { requireAdmin, requireGestor } = await import('../src/lib/apiAuth');
const { middleware, isCrossSiteWrite } = await import('../src/middleware');

const PASSWORD_HASH = await hashPassword('senha-de-teste-123');

function account(role: string, extra: Record<string, unknown> = {}) {
  state.admins.set('current', {
    id: 'a1', email: 'x@spot.com', name: 'Pessoa', role, active: true, passwordHash: PASSWORD_HASH,
    scopedUnits: [{ unitId: 'u1' }], scopedSectors: [{ sectorId: 's1' }], scopedShifts: [{ shift: 'DIA' }],
    ...extra,
  });
}

async function tokenFor(role: string, passwordHash = PASSWORD_HASH) {
  return createSessionToken({ adminId: 'a1', email: 'x@spot.com', name: 'Pessoa', role }, passwordHash);
}

async function status(p: Promise<unknown>): Promise<number | 'ok'> {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return (err as { status?: number }).status ?? 500;
  }
}

beforeEach(() => {
  state.admins.clear();
  state.cookies.clear();
  state.employee = null;
  state.survey = null;
});

// --- requireAdmin --------------------------------------------------------------

describe('requireAdmin — porta do painel administrativo', () => {
  it('sem cookie: 401', async () => {
    expect(await status(requireAdmin())).toBe(401);
  });

  it('token assinado com outra chave: 401', async () => {
    account('SUPER_ADMIN');
    const forjado = await new SignJWT({ adminId: 'a1', role: 'SUPER_ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('outra-chave-qualquer-de-atacante!!'));
    state.cookies.set('spot_admin_session', forjado);
    expect(await status(requireAdmin())).toBe(401);
  });

  it('token com alg "none": 401', async () => {
    account('SUPER_ADMIN');
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    state.cookies.set('spot_admin_session', `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ adminId: 'a1', role: 'SUPER_ADMIN' })}.`);
    expect(await status(requireAdmin())).toBe(401);
  });

  it('GESTOR com sessão válida tentando o painel admin: 403', async () => {
    account('GESTOR');
    state.cookies.set('spot_admin_session', await tokenFor('GESTOR'));
    expect(await status(requireAdmin())).toBe(403);
  });

  it('papel no token diz SUPER_ADMIN mas o banco diz GESTOR (rebaixado depois do login): 403', async () => {
    account('GESTOR');
    state.cookies.set('spot_admin_session', await tokenFor('SUPER_ADMIN'));
    expect(await status(requireAdmin())).toBe(403);
  });

  it('conta desativada com token ainda válido: 401', async () => {
    account('RH', { active: false });
    state.cookies.set('spot_admin_session', await tokenFor('RH'));
    expect(await status(requireAdmin())).toBe(401);
  });

  it('senha trocada depois do login: a sessão antiga cai (401)', async () => {
    account('RH');
    const antigo = await hashPassword('senha-antiga-999');
    state.cookies.set('spot_admin_session', await tokenFor('RH', antigo));
    expect(await status(requireAdmin())).toBe(401);
  });

  it('token sem a impressão digital da senha (emitido antes da regra): 401', async () => {
    account('RH');
    const semPv = await new SignJWT({ adminId: 'a1', email: 'x', name: 'x', role: 'RH' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    state.cookies.set('spot_admin_session', semPv);
    expect(await status(requireAdmin())).toBe(401);
  });

  it('RH com sessão válida passa', async () => {
    account('RH');
    state.cookies.set('spot_admin_session', await tokenFor('RH'));
    expect(await status(requireAdmin())).toBe('ok');
  });
});

describe('requireGestor — porta do portal da operação', () => {
  it('RH não entra no portal do gestor: 403', async () => {
    account('RH');
    state.cookies.set('spot_gestor_session', await tokenFor('RH'));
    expect(await status(requireGestor())).toBe(403);
  });

  it('o cookie do admin não abre o portal do gestor (cookies separados): 401', async () => {
    account('GESTOR');
    state.cookies.set('spot_admin_session', await tokenFor('GESTOR'));
    expect(await status(requireGestor())).toBe(401);
  });

  it('o escopo vem do banco, não do token', async () => {
    account('GESTOR');
    state.cookies.set('spot_gestor_session', await tokenFor('GESTOR'));
    const s = await requireGestor();
    expect(s.scopedUnitIds).toEqual(['u1']);
    expect(s.scopedSectorIds).toEqual(['s1']);
  });
});

// --- Middleware ----------------------------------------------------------------

function req(url: string, init: { method?: string; cookie?: string; origin?: string; site?: string } = {}) {
  const headers = new Headers({ host: 'spot.test' });
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.origin) headers.set('origin', init.origin);
  if (init.site) headers.set('sec-fetch-site', init.site);
  return new NextRequest(`https://spot.test${url}`, { method: init.method ?? 'GET', headers });
}

describe('middleware', () => {
  it('API do admin sem sessão: 401 sem dados', async () => {
    const res = await middleware(req('/api/admin/surveys'));
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('API do admin com sessão de GESTOR: 403', async () => {
    const res = await middleware(req('/api/admin/admins', { cookie: `spot_admin_session=${await tokenFor('GESTOR')}` }));
    expect(res.status).toBe(403);
  });

  it('página do admin com sessão de GESTOR vai para o portal do gestor', async () => {
    const res = await middleware(req('/admin/users', { cookie: `spot_admin_session=${await tokenFor('GESTOR')}` }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://spot.test/gestor');
  });

  it('CSRF: POST de outro site é recusado, inclusive no login', async () => {
    const res = await middleware(req('/api/auth/login', { method: 'POST', origin: 'https://site-malicioso.com' }));
    expect(res.status).toBe(403);
  });

  it('CSRF: POST sem Origin mas com Sec-Fetch-Site cross-site é recusado', () => {
    expect(isCrossSiteWrite(req('/api/public/responses', { method: 'POST', site: 'cross-site' }))).toBe(true);
  });

  it('POST da própria origem passa; GET nunca é barrado pelo CSRF', () => {
    expect(isCrossSiteWrite(req('/api/public/responses', { method: 'POST', origin: 'https://spot.test' }))).toBe(false);
    expect(isCrossSiteWrite(req('/api/public/surveys', { origin: 'https://site-malicioso.com' }))).toBe(false);
  });
});

// --- Handlers reais -----------------------------------------------------------

describe('handlers: acesso vertical e horizontal', () => {
  it('GESTOR chamando o resultado da pesquisa direto na API: 403', async () => {
    const { GET } = await import('../src/app/api/admin/surveys/[id]/results/route');
    account('GESTOR');
    state.cookies.set('spot_admin_session', await tokenFor('GESTOR'));
    const res = await GET(req('/api/admin/surveys/s1/results'), { params: Promise.resolve({ id: 's1' }) });
    expect(res.status).toBe(403);
  });

  it('RH com pesquisa aberta: a API devolve a trava, não os números', async () => {
    const { GET } = await import('../src/app/api/admin/surveys/[id]/results/route');
    account('RH');
    state.cookies.set('spot_admin_session', await tokenFor('RH'));
    state.survey = { id: 's1', name: 'Clima', status: 'OPEN', eligiblePopulation: 10, anonymityThreshold: 5 };
    const res = await GET(req('/api/admin/surveys/s1/results'), { params: Promise.resolve({ id: 's1' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.locked).toBe('SURVEY_OPEN');
    expect(body.comments.locked).toBe('SURVEY_OPEN');
  });

  it('RH tentando listar/gerir administradores (só Super Admin): 403', async () => {
    const { GET } = await import('../src/app/api/admin/admins/route');
    account('RH');
    state.cookies.set('spot_admin_session', await tokenFor('RH'));
    expect((await GET()).status).toBe(403);
  });

  it('RH não lê a trilha de auditoria (e-mails e IPs dos admins): 403', async () => {
    const { GET } = await import('../src/app/api/admin/audit-logs/route');
    account('RH');
    state.cookies.set('spot_admin_session', await tokenFor('RH'));
    expect((await GET(req('/api/admin/audit-logs'))).status).toBe(403);
  });

  it('IDOR: gestor pedindo funcionário de outra unidade pelo id: 403', async () => {
    const { GET } = await import('../src/app/api/gestor/employees/[id]/route');
    account('GESTOR');
    state.cookies.set('spot_gestor_session', await tokenFor('GESTOR'));
    state.employee = { id: 'e9', unitId: 'OUTRA', sectorId: 's1', shift: 'DIA', sector: {}, unit: {} };
    const res = await GET(req('/api/gestor/employees/e9'), { params: Promise.resolve({ id: 'e9' }) });
    expect(res.status).toBe(403);
  });

  it('IDOR: gestor do turno do dia pedindo funcionário da noite: 403', async () => {
    const { GET } = await import('../src/app/api/gestor/employees/[id]/route');
    account('GESTOR');
    state.cookies.set('spot_gestor_session', await tokenFor('GESTOR'));
    state.employee = { id: 'e9', unitId: 'u1', sectorId: 's1', shift: 'NOITE', sector: {}, unit: {} };
    const res = await GET(req('/api/gestor/employees/e9'), { params: Promise.resolve({ id: 'e9' }) });
    expect(res.status).toBe(403);
  });

  it('TREINADOR tentando preencher avaliação de experiência: 403', async () => {
    const { POST } = await import('../src/app/api/gestor/employees/[id]/evaluate/route');
    account('TREINADOR');
    state.cookies.set('spot_gestor_session', await tokenFor('TREINADOR'));
    const res = await POST(req('/api/gestor/employees/e1/evaluate', { method: 'POST' }), { params: Promise.resolve({ id: 'e1' }) });
    expect(res.status).toBe(403);
  });

  it('avaliação com data no futuro é recusada (empurraria o próximo feedback e calaria os lembretes)', async () => {
    const { POST } = await import('../src/app/api/gestor/employees/[id]/evaluate/route');
    account('GESTOR');
    state.cookies.set('spot_gestor_session', await tokenFor('GESTOR'));
    state.employee = {
      id: 'e1', unitId: 'u1', sectorId: 's1', shift: 'DIA', isApprentice: false, status: 'AWAITING_PERIOD_1',
      admissionDate: new Date('2026-08-01T00:00:00Z'), sector: { usesColorCycle: false },
    };
    const sub = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'SIM']));
    const futuro = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const r = req('/api/gestor/employees/e1/evaluate', { method: 'POST' });
    const body = {
      evaluationDate: futuro, dueDateAtEvaluation: futuro,
      flexibilityRating: 'BOM', flexibilitySubAnswers: sub(4), interestRating: 'BOM', interestSubAnswers: sub(3),
      relationshipRating: 'BOM', relationshipSubAnswers: sub(2), learningRating: 'BOM', learningSubAnswers: sub(2),
      favorableAspects: 'ok ok', unfavorableAspects: 'ok ok', classification: 'OTIMAS_PERSPECTIVAS', conclusion: 'EFETIVAR',
    };
    const res = await POST(new NextRequest(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'e1' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/entre a admissão e hoje/);
  });

  it('GESTOR tentando excluir funcionário (só Líder/Super Admin): 403', async () => {
    const { DELETE } = await import('../src/app/api/gestor/employees/[id]/route');
    account('GESTOR');
    state.cookies.set('spot_gestor_session', await tokenFor('GESTOR'));
    state.employee = { id: 'e1', unitId: 'u1', sectorId: 's1', shift: 'DIA', sector: {}, unit: {} };
    const res = await DELETE(req('/api/gestor/employees/e1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'e1' }) });
    expect(res.status).toBe(403);
  });

  it('TREINADOR no detalhe do funcionário não recebe situação, cor nem prazos', async () => {
    const { GET } = await import('../src/app/api/gestor/employees/[id]/route');
    account('TREINADOR');
    state.cookies.set('spot_gestor_session', await tokenFor('TREINADOR'));
    state.employee = {
      id: 'e1', fullName: 'Ana', roleDescription: 'Garçom', shift: 'DIA', admissionDate: '2026-09-01',
      unitId: 'u1', sectorId: 's1', status: 'HIRED', currentColor: 'VERMELHO', period1DueDate: 'x',
      nextFeedbackDueDate: 'y', createdById: 'rh', sector: { id: 's1', name: 'Salão', usesColorCycle: true, inTraining: true }, unit: { id: 'u1', name: 'Loja' },
    };
    const res = await GET(req('/api/gestor/employees/e1'), { params: Promise.resolve({ id: 'e1' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    for (const campo of ['status', 'currentColor', 'period1DueDate', 'nextFeedbackDueDate', 'createdById']) {
      expect(body.employee).not.toHaveProperty(campo);
    }
  });

  it('TREINADOR abrindo pelo id um colaborador de setor fora do treinamento (Cozinha): 403', async () => {
    const { GET } = await import('../src/app/api/gestor/employees/[id]/route');
    account('TREINADOR');
    state.cookies.set('spot_gestor_session', await tokenFor('TREINADOR'));
    state.employee = {
      id: 'e2', fullName: 'Bia', roleDescription: 'Cozinheira', shift: 'DIA', admissionDate: '2026-09-01',
      unitId: 'u1', sectorId: 's1', status: 'HIRED', sector: { id: 's1', name: 'Cozinha', usesColorCycle: false, inTraining: false },
      unit: { id: 'u1', name: 'Loja' },
    };
    const res = await GET(req('/api/gestor/employees/e2'), { params: Promise.resolve({ id: 'e2' }) });
    expect(res.status).toBe(403);
  });
});
