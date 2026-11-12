export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';
import { pushStatus, pushSubscribe, pushUnsubscribe } from '@/lib/pushRoute';

/**
 * Avisos no celular para o portal da operação.
 *
 * Exige `notifications.receive`: quem não é destinatário de aviso — hoje o
 * Treinador tem, o RH não passa por aqui — não inscreve aparelho.
 */
export async function GET() {
  try {
    const session = await requireGestor();
    requirePermission(session, 'notifications.receive');
    return await pushStatus(session.adminId);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'notifications.receive');
    return await pushSubscribe(req, session.adminId, 'gestor');
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'notifications.receive');
    return await pushUnsubscribe(req, session.adminId);
  } catch (err) {
    return handleApiError(err);
  }
}
