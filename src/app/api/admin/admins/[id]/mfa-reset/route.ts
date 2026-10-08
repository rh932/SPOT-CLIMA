export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { requireAdmin, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';

/**
 * Desliga a verificação em duas etapas de OUTRA conta — para quem perdeu o
 * celular e os códigos de recuperação. A pessoa entra só com a senha e liga de
 * novo. A própria conta se desliga pela tela "Minha conta" (exige código).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    if (params.id === session.adminId) {
      throw new ApiError(400, 'Para a sua própria conta, use Configurações > Verificação em duas etapas.');
    }
    const [row] = await db.update(schema.admins)
      .set({ mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: new Date() })
      .where(eq(schema.admins.id, params.id))
      .returning({ id: schema.admins.id });
    if (!row) throw new ApiError(404, 'Usuário não encontrado.');
    await logAudit({ adminId: session.adminId, action: 'mfa.reset', entityType: 'Admin', entityId: params.id, req });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
