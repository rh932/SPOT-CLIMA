export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';
import { listInbox, markInboxRead } from '@/lib/notificationInbox';

/** Caixa de avisos de quem está logado no portal da operação. */
export async function GET() {
  try {
    const session = await requireGestor();
    requirePermission(session, 'notifications.receive');
    return NextResponse.json(await listInbox(session.adminId));
  } catch (err) {
    return handleApiError(err);
  }
}

/** Marca avisos como lidos — todos, ou só os `ids` enviados. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'notifications.receive');
    const body = await req.json().catch(() => null);
    return NextResponse.json({ ok: true, lidas: await markInboxRead(session.adminId, body) });
  } catch (err) {
    return handleApiError(err);
  }
}
