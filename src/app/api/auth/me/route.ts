export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { getSession } from '@/lib/auth';
import { fingerprintMatches } from '@/lib/sessionFingerprint';

/**
 * Quem está logado neste portal. Antes devolvia o JWT inteiro sem olhar o
 * banco: conta desativada, rebaixada ou com senha trocada continuava
 * aparecendo com o papel antigo. Agora a resposta sai do banco e só com o que
 * as telas usam.
 */
export async function GET(req: NextRequest) {
  const portal = req.nextUrl.searchParams.get('portal') === 'gestor' ? 'gestor' : 'admin';
  const session = await getSession(portal);
  if (!session) return NextResponse.json({ admin: null });

  const admin = await db.query.admins.findFirst({
    where: eq(schema.admins.id, session.adminId),
    columns: { id: true, email: true, name: true, role: true, active: true, passwordHash: true },
  });
  if (!admin || !admin.active || !fingerprintMatches(session.pv, admin.passwordHash)) {
    return NextResponse.json({ admin: null });
  }
  return NextResponse.json({ admin: { adminId: admin.id, email: admin.email, name: admin.name, role: admin.role } });
}
