export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status !== 'DRAFT' && survey.status !== 'SCHEDULED') {
      throw new ApiError(400, 'Apenas pesquisas em rascunho ou agendadas podem ser publicadas.');
    }
    const questionCount = await db.query.questions.findMany({ where: eq(schema.questions.surveyId, params.id) });
    if (questionCount.length === 0) {
      throw new ApiError(400, 'Adicione ao menos uma pergunta antes de publicar a pesquisa.');
    }

    const [row] = await db
      .update(schema.surveys)
      .set({ status: 'OPEN', openDate: survey.openDate ?? new Date(), updatedAt: new Date() })
      .where(eq(schema.surveys.id, params.id))
      .returning();

    await logAudit({ adminId: session.adminId, action: 'survey.publish', entityType: 'Survey', entityId: row.id, req });
    return NextResponse.json({ survey: row });
  } catch (err) {
    return handleApiError(err);
  }
}
