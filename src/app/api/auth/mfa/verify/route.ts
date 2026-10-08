import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import {
  clearChallengeCookie, consumeSecondFactor, readChallengeCookie, remainingRecoveryCodes, verifyChallengeToken,
} from '@/lib/mfa';
import { fingerprintMatches } from '@/lib/sessionFingerprint';
import { mfaCodeSchema } from '@/lib/validation';
import { consumeRateLimit, clearRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/audit';
import { clientIp } from '@/lib/clientIp';
import { ADMIN_ROLES, GESTOR_PORTAL_ROLES, type Role } from '@/lib/permissions';

const EXPIROU = 'A verificação expirou. Entre com a senha de novo.';
const INVALIDO = 'Código inválido ou já usado.';
const MUITAS = 'Muitas tentativas. Entre com a senha de novo daqui a alguns minutos.';
const JANELA = 15 * 60 * 1000;
const PORTAL_ROLES: Record<'admin' | 'gestor', Role[]> = { admin: ADMIN_ROLES, gestor: GESTOR_PORTAL_ROLES };

/**
 * Segunda etapa do login: o código do app autenticador (ou de recuperação).
 * Só chega aqui quem acertou a senha nos últimos 5 minutos — o desafio fica no
 * cookie gravado por /api/auth/login (ver src/lib/mfa.ts).
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const token = await readChallengeCookie();
  const challenge = token ? await verifyChallengeToken(token) : null;
  if (!challenge) {
    return NextResponse.json({ error: EXPIROU }, { status: 401 });
  }

  const parsed = mfaCodeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: INVALIDO }, { status: 400 });
  }

  // 6 dígitos são 1 milhão de combinações: 5 tentativas por conta a cada 15
  // minutos deixam a adivinhação inviável. O teto por IP segura varredura.
  const [porConta, porIp] = await Promise.all([
    consumeRateLimit('mfa-conta', challenge.adminId, 5, JANELA),
    consumeRateLimit('mfa-ip', ip, 50, JANELA),
  ]);
  if (!porConta.allowed || !porIp.allowed) {
    await clearChallengeCookie();
    await logAudit({ adminId: challenge.adminId, action: 'login.mfa_rate_limited', req });
    return NextResponse.json({ error: MUITAS }, { status: 429 });
  }

  const conta = await db.query.admins.findFirst({ where: eq(schema.admins.id, challenge.adminId) });
  // Conta desativada, senha trocada, papel mudado ou etapa desligada desde o
  // desafio: começa de novo pela senha.
  if (
    !conta || !conta.active || !conta.mfaEnabledAt || !conta.mfaSecret
    || !fingerprintMatches(challenge.pv, conta.passwordHash)
    || !PORTAL_ROLES[challenge.portal].includes(conta.role as Role)
  ) {
    await clearChallengeCookie();
    return NextResponse.json({ error: EXPIROU }, { status: 401 });
  }

  const result = await consumeSecondFactor(conta.id, conta.mfaSecret, conta.mfaLastStep, parsed.data.code, {
    allowRecovery: true,
  });
  if (!result.ok) {
    await logAudit({ adminId: conta.id, action: 'login.mfa_failed', req });
    return NextResponse.json({ error: INVALIDO }, { status: 401 });
  }

  const sessionToken = await createSessionToken(
    { adminId: conta.id, email: conta.email, name: conta.name, role: conta.role },
    conta.passwordHash,
  );
  await setSessionCookie(challenge.portal, sessionToken);
  await clearChallengeCookie();
  await clearRateLimit('mfa-conta', conta.id);
  await logAudit({ adminId: conta.id, action: 'login.success', metadata: { segundaEtapa: result.method }, req });

  // Usou código de recuperação: avisa quantos sobram, para a pessoa gerar novos.
  let recoveryLeft: number | undefined;
  if (result.method === 'recovery') {
    const depois = await db.query.admins.findFirst({
      where: eq(schema.admins.id, conta.id),
      columns: { mfaRecoveryCodes: true },
    });
    recoveryLeft = remainingRecoveryCodes(depois?.mfaRecoveryCodes);
  }

  return NextResponse.json({
    ok: true,
    recoveryLeft,
    admin: { id: conta.id, name: conta.name, email: conta.email, role: conta.role },
  });
}
