export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status !== 'CLOSED') throw new ApiError(400, 'Apenas pesquisas encerradas podem ser arquivadas.');

    const [row] = await db
      .update(schema.surveys)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(schema.surveys.id, params.id))
      .returning();

    await logAudit({ adminId: session.adminId, action: 'survey.archive', entityType: 'Survey', entityId: row.id, req });
    return NextResponse.json({ survey: row });
  } catch (err) {
    return handleApiError(err);
  }
}
