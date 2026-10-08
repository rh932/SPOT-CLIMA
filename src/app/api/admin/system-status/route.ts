export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { cronHealth, getCronRun } from '@/lib/cronStatus';

/** Situação da rotina diária de avisos, para Configurações e para o aviso da Visão Geral. */
export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');
    const run = await getCronRun();
    return NextResponse.json({ cron: { run, health: cronHealth(run) } });
  } catch (err) {
    return handleApiError(err);
  }
}
