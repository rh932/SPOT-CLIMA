export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { createSessionToken, hashPassword, setSessionCookie, type Portal } from '@/lib/auth';
import { codeMatches } from '@/lib/firstAccess';
import { firstAccessSchema } from '@/lib/validation';
import { consumeRateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/clientIp';
import { logAudit } from '@/lib/audit';
import { SCOPED_ROLES } from '@/lib/userAccess';

const INVALIDO = 'E-mail ou código de primeiro acesso inválido. Confira a mensagem do RH ou peça um novo código.';

/**
 * Primeiro acesso: a pessoa cria a própria senha com o e-mail e o código que
 * o RH mandou (ver src/lib/firstAccess.ts). Sem `password`, só confere — é o
 * que deixa o link da mensagem abrir já dizendo "Olá, fulano".
 *
 * Só vale para conta ativa que nunca entrou. Depois de criar a senha, a
 * pessoa já sai logada no portal do perfil dela.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const body = await req.json().catch(() => null);
  const parsed = firstAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? INVALIDO }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  // Mesma lógica do login: o teto forte é por conta (o Wi-Fi do restaurante é um IP só).
  // Contadores compartilhados entre instâncias (tabela rate_limits). O código
  // tem ~40 bits; com 10 tentativas por 15 min por conta, adivinhar é inviável.
  const [porConta, porIp] = await Promise.all([
    consumeRateLimit('primeiro-acesso-conta', email, 10, 15 * 60 * 1000),
    consumeRateLimit('primeiro-acesso-ip', ip, 60, 15 * 60 * 1000),
  ]);
  if (!porConta.allowed || !porIp.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas. Espere alguns minutos e tente de novo.' }, { status: 429 });
  }

  const admin = await db.query.admins.findFirst({ where: eq(schema.admins.email, email) });
  if (!admin || !admin.active || !codeMatches(parsed.data.code, admin.id, admin.passwordHash)) {
    // Sem o e-mail digitado no log: era texto livre de quem nem tem conta.
    await logAudit({ adminId: admin?.id ?? null, action: 'first_access.failed', req });
    return NextResponse.json({ error: INVALIDO }, { status: 401 });
  }

  const jaEntrou = await db.query.auditLogs.findFirst({
    where: and(eq(schema.auditLogs.adminId, admin.id), eq(schema.auditLogs.action, 'login.success')),
    columns: { id: true },
  });
  const portal: Portal = (SCOPED_ROLES as string[]).includes(admin.role) ? 'gestor' : 'admin';
  if (jaEntrou) {
    return NextResponse.json(
      { error: 'Este acesso já foi ativado. Entre com o seu e-mail e a sua senha.', alreadyActive: true, home: `/${portal}/login` },
      { status: 409 },
    );
  }

  if (!parsed.data.password) {
    return NextResponse.json({ ok: true, name: admin.name });
  }

  const novoHash = await hashPassword(parsed.data.password);
  // Troca só se a senha ainda é a mesma de quando o código foi conferido:
  // dois envios ao mesmo tempo não criam duas senhas.
  const [trocada] = await db
    .update(schema.admins)
    .set({ passwordHash: novoHash, updatedAt: new Date() })
    .where(and(eq(schema.admins.id, admin.id), eq(schema.admins.passwordHash, admin.passwordHash)))
    .returning({ id: schema.admins.id });
  if (!trocada) {
    return NextResponse.json({ error: 'Este código acabou de ser usado. Entre com o seu e-mail e a sua senha.' }, { status: 409 });
  }

  const token = await createSessionToken({ adminId: admin.id, email: admin.email, name: admin.name, role: admin.role }, novoHash);
  await setSessionCookie(portal, token);
  await logAudit({ adminId: admin.id, action: 'first_access.password_set', req });
  await logAudit({ adminId: admin.id, action: 'login.success', metadata: { via: 'primeiro-acesso' }, req });

  return NextResponse.json({ ok: true, home: `/${portal}` });
}
