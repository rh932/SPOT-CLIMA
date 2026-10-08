export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';
import { surveyFromTemplateSchema } from '@/lib/validation';
import { DEFAULT_ANONYMITY_THRESHOLD } from '@/lib/anonymity';

// Modelo -> nova pesquisa. Aberto a qualquer admin (uso normal da biblioteca,
// não é curadoria). Copia as perguntas para linhas novas — editar o modelo
// depois nunca afeta esta pesquisa (mesmo padrão de surveys/[id]/duplicate).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const template = await db.query.questionTemplates.findFirst({ where: eq(schema.questionTemplates.id, params.id) });
    if (!template) throw new ApiError(404, 'Modelo não encontrado.');

    // O corpo era gravado cru: limite de anonimato 0 ou negativo passava e
    // mostrava a nota de qualquer setor de uma pessoa só.
    const parsed = surveyFromTemplateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const newSurvey = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.surveys)
        .values({
          name: body.name || `Pesquisa - ${template.name}`,
          description: body.description ?? template.description ?? null,
          status: 'DRAFT',
          eligiblePopulation: body.eligiblePopulation ?? null,
          anonymityThreshold: body.anonymityThreshold ?? DEFAULT_ANONYMITY_THRESHOLD,
          sourceTemplateId: template.id,
        })
        .returning();

      const templateQuestions = await tx.query.templateQuestions.findMany({
        where: and(eq(schema.templateQuestions.templateId, template.id), eq(schema.templateQuestions.active, true)),
        orderBy: asc(schema.templateQuestions.order),
        with: { options: { orderBy: (o, { asc }) => asc(o.order) } },
      });

      for (const tq of templateQuestions) {
        const [newQuestion] = await tx
          .insert(schema.questions)
          .values({
            surveyId: created.id,
            dimensionId: tq.dimensionId,
            text: tq.text,
            type: tq.type,
            required: tq.required,
            order: tq.order,
            active: tq.active,
            scaleMin: tq.scaleMin,
            scaleMax: tq.scaleMax,
            isEnps: tq.isEnps,
          })
          .returning();
        if (tq.options.length > 0) {
          await tx.insert(schema.questionOptions).values(
            tq.options.map((o) => ({ questionId: newQuestion.id, label: o.label, order: o.order }))
          );
        }
      }
      return created;
    });

    await logAudit({
      adminId: session.adminId,
      action: 'survey.create_from_template',
      entityType: 'Survey',
      entityId: newSurvey.id,
      metadata: { templateId: template.id },
      req,
    });

    return NextResponse.json({ survey: newSurvey }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
