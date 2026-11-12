export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

/**
 * Sair apaga o cookie deste navegador. O token é stateless: quem copiou o
 * cookie antes continua com ele até expirar (8h) — para derrubar TODAS as
 * sessões de uma conta, troque a senha (src/lib/sessionFingerprint.ts).
 */
export async function POST(req: NextRequest) {
  const portal = req.nextUrl.searchParams.get('portal') === 'gestor' ? 'gestor' : 'admin';
  const session = await getSession(portal);
  await clearSessionCookie(portal);
  if (session) await logAudit({ adminId: session.adminId, action: 'logout', metadata: { portal }, req });
  return NextResponse.json({ ok: true });
}
