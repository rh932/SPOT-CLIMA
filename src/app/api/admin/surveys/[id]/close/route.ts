export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';
import { getSurveyResults } from '@/lib/results';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status !== 'OPEN') throw new ApiError(400, 'Apenas pesquisas abertas podem ser encerradas.');

    const [row] = await db
      .update(schema.surveys)
      .set({ status: 'CLOSED', closeDate: new Date(), updatedAt: new Date() })
      .where(eq(schema.surveys.id, params.id))
      .returning();

    // Gera o resumo executivo (item 50 do briefing) e congela como snapshot.
    const results = await getSurveyResults(params.id);
    if (results) {
      await db
        .insert(schema.surveySnapshots)
        .values({ surveyId: params.id, data: results as unknown as object })
        .onConflictDoUpdate({
          target: schema.surveySnapshots.surveyId,
          set: { data: results as unknown as object, generatedAt: new Date() },
        });
    }

    await logAudit({ adminId: session.adminId, action: 'survey.close', entityType: 'Survey', entityId: row.id, req });
    return NextResponse.json({ survey: row, summary: results });
  } catch (err) {
    return handleApiError(err);
  }
}
