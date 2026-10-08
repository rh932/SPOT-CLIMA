export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';
import { duplicateSchema } from '@/lib/validation';

// Modelo -> novo modelo (clonar/renomear). Curadoria da biblioteca: SUPER_ADMIN.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const original = await db.query.questionTemplates.findFirst({ where: eq(schema.questionTemplates.id, params.id) });
    if (!original) throw new ApiError(404, 'Modelo não encontrado.');

    const parsed = duplicateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 });
    const name = parsed.data.name || `${original.name} (cópia)`;

    const [newTemplate] = await db
      .insert(schema.questionTemplates)
      .values({
        name,
        description: original.description,
        categoryId: original.categoryId,
        duplicatedFromTemplateId: original.id,
        createdById: session.adminId,
      })
      .returning();

    const originalQuestions = await db.query.templateQuestions.findMany({
      where: and(eq(schema.templateQuestions.templateId, original.id), eq(schema.templateQuestions.active, true)),
      orderBy: asc(schema.templateQuestions.order),
      with: { options: { orderBy: (o, { asc }) => asc(o.order) } },
    });

    for (const q of originalQuestions) {
      const [newQuestion] = await db
        .insert(schema.templateQuestions)
        .values({
          templateId: newTemplate.id,
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
        await db.insert(schema.templateQuestionOptions).values(
          q.options.map((o) => ({ templateQuestionId: newQuestion.id, label: o.label, order: o.order }))
        );
      }
    }

    await logAudit({
      adminId: session.adminId,
      action: 'template.duplicate',
      entityType: 'QuestionTemplate',
      entityId: newTemplate.id,
      metadata: { fromTemplateId: original.id },
      req,
    });

    return NextResponse.json({ template: newTemplate }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
