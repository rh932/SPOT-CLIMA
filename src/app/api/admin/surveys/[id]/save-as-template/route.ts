export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { questionTemplateSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// Pesquisa -> novo modelo (só perguntas ativas). Curadoria da biblioteca: SUPER_ADMIN.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');

    const body = await req.json().catch(() => null);
    const parsed = questionTemplateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos. Informe ao menos um nome para o modelo.' }, { status: 400 });

    const [newTemplate] = await db
      .insert(schema.questionTemplates)
      .values({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        categoryId: parsed.data.categoryId ?? null,
        createdById: session.adminId,
      })
      .returning();

    const questions = await db.query.questions.findMany({
      where: and(eq(schema.questions.surveyId, params.id), eq(schema.questions.active, true)),
      orderBy: asc(schema.questions.order),
      with: { options: { orderBy: (o, { asc }) => asc(o.order) } },
    });

    for (const q of questions) {
      const [newTQ] = await db
        .insert(schema.templateQuestions)
        .values({
          templateId: newTemplate.id,
          dimensionId: q.dimensionId,
          text: q.text,
          type: q.type,
          required: q.required,
          order: q.order,
          scaleMin: q.scaleMin,
          scaleMax: q.scaleMax,
        })
        .returning();
      if (q.options.length > 0) {
        await db.insert(schema.templateQuestionOptions).values(
          q.options.map((o) => ({ templateQuestionId: newTQ.id, label: o.label, order: o.order }))
        );
      }
    }

    await logAudit({
      adminId: session.adminId,
      action: 'template.create_from_survey',
      entityType: 'QuestionTemplate',
      entityId: newTemplate.id,
      metadata: { surveyId: params.id },
      req,
    });

    return NextResponse.json({ template: newTemplate }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
