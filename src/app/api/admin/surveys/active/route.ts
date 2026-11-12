export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAdmin, requireAnyPermission, handleApiError } from '@/lib/apiAuth';

/** Pesquisa "em foco" para a Visão Geral: a aberta mais recente, ou a mais recente de qualquer status. */
export async function GET() {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['surveys.manage', 'reports.view']);
    const open = await db.query.surveys.findFirst({
      where: eq(schema.surveys.status, 'OPEN'),
      orderBy: desc(schema.surveys.openDate),
    });
    if (open) return NextResponse.json({ survey: open });

    const latest = await db.query.surveys.findFirst({ orderBy: desc(schema.surveys.createdAt) });
    return NextResponse.json({ survey: latest ?? null });
  } catch (err) {
    return handleApiError(err);
  }
}
