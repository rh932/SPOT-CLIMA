export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';
import { duplicateSchema } from '@/lib/validation';
import { effectiveThreshold } from '@/lib/anonymity';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const original = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!original) throw new ApiError(404, 'Pesquisa não encontrada.');

    const parsed = duplicateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 });
    const name = parsed.data.name || `${original.name} (cópia)`;

    // Perguntas e dimensões são copiadas; respostas NUNCA são copiadas — a nova pesquisa começa zerada (item 30).
    const [newSurvey] = await db
      .insert(schema.surveys)
      .values({
        name,
        description: original.description,
        status: 'DRAFT',
        eligiblePopulation: original.eligiblePopulation,
        anonymityThreshold: effectiveThreshold(original.anonymityThreshold),
        duplicatedFromId: original.id,
      })
      .returning();

    const originalQuestions = await db.query.questions.findMany({
      where: eq(schema.questions.surveyId, original.id),
      orderBy: asc(schema.questions.order),
      with: { options: { orderBy: (o, { asc }) => asc(o.order) } },
    });

    for (const q of originalQuestions) {
      const [newQuestion] = await db
        .insert(schema.questions)
        .values({
          surveyId: newSurvey.id,
          dimensionId: q.dimensionId,
          text: q.text,
          type: q.type,
          required: q.required,
          order: q.order,
          active: q.active,
          scaleMin: q.scaleMin,
          scaleMax: q.scaleMax,
        })
        .returning();
      if (q.options.length > 0) {
        await db.insert(schema.questionOptions).values(
          q.options.map((o) => ({ questionId: newQuestion.id, label: o.label, order: o.order }))
        );
      }
    }

    await logAudit({
      adminId: session.adminId,
      action: 'survey.duplicate',
      entityType: 'Survey',
      entityId: newSurvey.id,
      metadata: { fromSurveyId: original.id },
      req,
    });

    return NextResponse.json({ survey: newSurvey }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
