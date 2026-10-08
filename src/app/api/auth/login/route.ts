import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { verifyPasswordConstantTime } from '@/lib/password';
import { loginSchema } from '@/lib/validation';
import { consumeRateLimit, clearRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/audit';
import { clientIp } from '@/lib/clientIp';
import { GESTOR_PORTAL_ROLES } from '@/lib/permissions';

const INVALIDO = 'E-mail ou senha inválidos.';
const MUITAS = 'Muitas tentativas de login. Tente novamente em alguns minutos.';
const JANELA = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: INVALIDO }, { status: 400 });
  }

  // Três tetos, todos compartilhados entre instâncias (tabela rate_limits):
  // - conta + IP, o mais apertado: segura força bruta de um aparelho;
  // - conta, mais folgado: segura força bruta distribuída sem deixar que
  //   alguém trave o login de um colega só errando a senha dele de propósito;
  // - IP, alto: no restaurante o Wi-Fi é um IP só para todo mundo — ele só
  //   contém varredura de e-mails a partir de uma origem.
  const email = parsed.data.email.toLowerCase();
  const [porContaIp, porConta, porIp] = await Promise.all([
    consumeRateLimit('login-conta-ip', `${email}|${ip}`, 10, JANELA),
    consumeRateLimit('login-conta', email, 50, JANELA),
    consumeRateLimit('login-ip', ip, 100, JANELA),
  ]);
  if (!porContaIp.allowed || !porConta.allowed || !porIp.allowed) {
    await logAudit({ adminId: null, action: 'login.rate_limited', req });
    return NextResponse.json({ error: MUITAS }, { status: 429 });
  }

  const admin = await db.query.admins.findFirst({ where: eq(schema.admins.email, email) });
  const conta = admin && admin.active ? admin : null;

  // Mesmo trabalho com ou sem conta: o bcrypt roda contra um hash descartável
  // quando o e-mail não existe, e a mensagem é a mesma — nem a resposta nem o
  // tempo dizem quais e-mails existem.
  const valid = await verifyPasswordConstantTime(parsed.data.password, conta?.passwordHash);
  if (!conta || !valid) {
    // E-mail digitado não vai para o log: qualquer pessoa sem login escrevia
    // texto livre na auditoria. Quando a conta existe, o adminId já basta.
    await logAudit({ adminId: conta?.id ?? null, action: 'login.failed', req });
    return NextResponse.json({ error: INVALIDO }, { status: 401 });
  }

  // Cada portal aceita só os papéis dele. A mensagem diz para onde ir, em vez
  // de deixar o middleware autenticar e depois expulsar a sessão.
  const PORTAL_ROLES: Record<string, string[]> = {
    admin: ['SUPER_ADMIN', 'RH'],
    // Gestor, Líder e Treinador compartilham o portal da operação; o que cada
    // um enxerga lá dentro é decidido pelas permissões. O SUPER_ADMIN entra
    // nos dois: no /gestor ele acompanha a operação com o mesmo alcance do
    // Gestor Líder (ver GESTOR_PORTAL_ROLES em src/lib/permissions.ts).
    gestor: [...GESTOR_PORTAL_ROLES],
  };
  const PORTAL_HINT: Record<string, string> = {
    SUPER_ADMIN: 'Painel Administrativo',
    RH: 'Painel Administrativo',
    GESTOR: 'Avaliações e Treinamentos',
    GESTOR_LIDER: 'Avaliações e Treinamentos',
    TREINADOR: 'Avaliações e Treinamentos',
  };
  if (!PORTAL_ROLES[parsed.data.portal].includes(conta.role)) {
    await logAudit({ adminId: conta.id, action: 'login.wrong_portal', metadata: { portal: parsed.data.portal }, req });
    return NextResponse.json(
      { error: `Esta conta não acessa este painel. Seu acesso fica em ${PORTAL_HINT[conta.role] ?? 'outro painel'}.` },
      { status: 403 },
    );
  }

  // O escopo do gestor não entra no token — é lido do banco a cada requisição
  // (ver requireGestor em src/lib/apiAuth.ts). Token novo a cada login: não
  // existe reaproveitamento de sessão anterior (fixação de sessão).
  const token = await createSessionToken(
    { adminId: conta.id, email: conta.email, name: conta.name, role: conta.role },
    conta.passwordHash,
  );
  await setSessionCookie(parsed.data.portal, token);
  await clearRateLimit('login-conta-ip', `${email}|${ip}`);
  await logAudit({ adminId: conta.id, action: 'login.success', req });

  return NextResponse.json({ ok: true, admin: { id: conta.id, name: conta.name, email: conta.email, role: conta.role } });
}
