import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Cookies separados por portal — ver comentário em src/lib/auth.ts. Logar no
// /gestor não pode afetar uma sessão aberta em /admin no mesmo navegador.
const SESSION_COOKIES = {
  admin: 'spot_admin_session',
  gestor: 'spot_gestor_session',
};

interface PortalConfig {
  pagePrefix: string;
  apiPrefix: string;
  loginPath: string;
  homePath: string;
  publicPagePaths: string[];
  cookieName: string;
  // Papéis que NUNCA passam neste portal, mesmo com sessão válida (ex.: um
  // GESTOR não pode entrar em /admin mesmo tendo uma conta real com senha).
  blockedRoles: string[];
}

const PORTALS: PortalConfig[] = [
  {
    pagePrefix: '/admin',
    apiPrefix: '/api/admin',
    loginPath: '/admin/login',
    homePath: '/admin',
    publicPagePaths: ['/admin/login'],
    cookieName: SESSION_COOKIES.admin,
    blockedRoles: ['GESTOR', 'GESTOR_LIDER', 'TREINADOR', 'GERENTE', 'GERENTE_AVALIADOR', 'GERENTE_TREINADOR'],
  },
  {
    pagePrefix: '/gestor',
    apiPrefix: '/api/gestor',
    loginPath: '/gestor/login',
    homePath: '/gestor',
    publicPagePaths: ['/gestor/login'],
    cookieName: SESSION_COOKIES.gestor,
    // Gestor, Gestor Líder e Treinador usam a mesma porta. O que cada um
    // enxerga é decidido pelas permissões (src/lib/permissions.ts) e checado
    // em cada rota — não por portais separados.
    blockedRoles: [],
  },
];

// Para onde mandar uma sessão VÁLIDA mas bloqueada neste portal (ex.: GESTOR
// em /admin) — o próprio portal do papel dela, nunca o portal que negou acesso
// (senão o redirect cai de novo no mesmo bloqueio e loopa).
const ROLE_HOME: Record<string, string> = {
  GESTOR: '/gestor',
  GESTOR_LIDER: '/gestor',
  TREINADOR: '/gestor',
  GERENTE: '/gestor',
  GERENTE_AVALIADOR: '/gestor',
  GERENTE_TREINADOR: '/gestor',
  RH: '/admin',
  SUPER_ADMIN: '/admin',
};

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? '');
}

async function getSessionRole(req: NextRequest, cookieName: string): Promise<string | null> {
  const token = req.cookies.get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] });
    // O desafio da verificação em duas etapas usa a mesma chave, mas não é sessão.
    if (payload.purpose !== undefined) return null;
    const role = (payload as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF: toda escrita na API tem que vir desta mesma origem. O cookie já é
 * SameSite=Lax (outro site não manda o cookie num POST), mas isso não cobre
 * o login — um formulário de fora conseguia logar a vítima na conta de outra
 * pessoa — nem navegador antigo. O navegador sempre manda `Origin` num POST
 * de outro site; sem `Origin`, vale `Sec-Fetch-Site`. Chamadas sem nenhum dos
 * dois (curl, cron) não carregam cookie de vítima, então não são CSRF.
 */
export function isCrossSiteWrite(req: NextRequest): boolean {
  if (!STATE_CHANGING.has(req.method)) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host !== host;
    } catch {
      return true;
    }
  }
  const site = req.headers.get('sec-fetch-site');
  return site !== null && site !== 'same-origin' && site !== 'none';
}

/** Resposta de API autenticada não fica no cache do navegador (aparelho compartilhado no restaurante). */
function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (isCrossSiteWrite(req)) {
      return noStore(NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 }));
    }
  }

  const portal = PORTALS.find((p) => pathname.startsWith(p.pagePrefix) || pathname.startsWith(p.apiPrefix));
  if (!portal) return pathname.startsWith('/api/') ? noStore(NextResponse.next()) : NextResponse.next();

  const isApi = pathname.startsWith(portal.apiPrefix);
  const isPublicPage = portal.publicPagePaths.includes(pathname);
  if (isPublicPage) return NextResponse.next();

  const role = await getSessionRole(req, portal.cookieName);
  const authed = role !== null;
  const blocked = authed && portal.blockedRoles.includes(role as string);

  if (!authed || blocked) {
    if (isApi) {
      return noStore(NextResponse.json(
        { error: authed ? 'Acesso negado para este painel.' : 'Não autenticado.' },
        { status: authed ? 403 : 401 },
      ));
    }
    // Uma sessão válida mas bloqueada (ex.: GESTOR tentando /admin) vai para o
    // próprio portal do papel dela, não para a tela de login do portal alheio
    // — evita tanto a confusão de redirecionar uma sessão autenticada para um
    // login quanto um loop (redirecionar de volta para o mesmo portal bloqueado).
    if (blocked) {
      return NextResponse.redirect(new URL(ROLE_HOME[role as string] ?? '/', req.url));
    }
    const loginUrl = new URL(portal.loginPath, req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return isApi ? noStore(NextResponse.next()) : NextResponse.next();
}

export const config = {
  // Toda a API passa por aqui (CSRF e no-store); a checagem de sessão só
  // vale para os prefixos dos portais (PORTALS).
  matcher: [
    '/admin/:path*', '/gestor/:path*',
    '/api/:path*',
  ],
};
