export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { DIMENSIONS_SEED } from '@/data/surveyBank';
import { logAudit } from '@/lib/audit';

/**
 * Importa o banco inicial de perguntas (74 perguntas, 9 dimensões, com a de eNPS) para uma
 * pesquisa em rascunho. Não duplica se a pesquisa já tiver perguntas — o
 * admin precisa esvaziar antes, para evitar bagunçar a ordem.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status !== 'DRAFT' && survey.status !== 'SCHEDULED') {
      throw new ApiError(400, 'Só é possível importar perguntas em pesquisas de rascunho.');
    }
    const existing = await db.query.questions.findMany({ where: eq(schema.questions.surveyId, params.id) });
    if (existing.length > 0) {
      throw new ApiError(400, 'Esta pesquisa já possui perguntas. Remova-as antes de importar o banco padrão.');
    }

    let order = 0;
    for (const dim of DIMENSIONS_SEED) {
      let [dimension] = await db.select().from(schema.dimensions).where(eq(schema.dimensions.name, dim.name));
      if (!dimension) {
        [dimension] = await db
          .insert(schema.dimensions)
          .values({ name: dim.name, description: dim.description, order: dim.order })
          .returning();
      }
      for (const q of dim.questions) {
        order += 1;
        const [inserted] = await db
          .insert(schema.questions)
          .values({
            surveyId: params.id,
            dimensionId: dimension.id,
            text: q.text,
            type: q.type,
            required: q.required,
            scaleMin: q.scaleMin ?? null,
            scaleMax: q.scaleMax ?? null,
            isEnps: q.isEnps ?? false,
            order,
          })
          .returning();
        if (q.options) {
          await db.insert(schema.questionOptions).values(q.options.map((label, idx) => ({ questionId: inserted.id, label, order: idx })));
        }
      }
    }

    await logAudit({ adminId: session.adminId, action: 'survey.seed_questions', entityType: 'Survey', entityId: params.id, req });
    return NextResponse.json({ ok: true, count: order });
  } catch (err) {
    return handleApiError(err);
  }
}
