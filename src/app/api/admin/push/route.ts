export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { pushStatus, pushSubscribe, pushUnsubscribe } from '@/lib/pushRoute';

/** Avisos no celular para o painel administrativo. Mesma lógica do gestor. */
export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'notifications.receive');
    return await pushStatus(session.adminId);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'notifications.receive');
    return await pushSubscribe(req, session.adminId, 'admin');
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'notifications.receive');
    return await pushUnsubscribe(req, session.adminId);
  } catch (err) {
    return handleApiError(err);
  }
}
