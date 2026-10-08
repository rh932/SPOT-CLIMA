export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { questionBaseSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

/**
 * Pergunta só muda com a pesquisa em rascunho ou agendada — a mesma regra das
 * outras rotas de pesquisa. Depois de aberta, trocar texto, tipo, dimensão ou
 * opções muda o sentido das respostas anônimas já gravadas (as escolhas são
 * guardadas pelo rótulo), e mover uma pergunta de dimensão mexe em qual grupo
 * de pessoas cada número representa. A tela já esconde a edição; aqui é o
 * servidor que garante.
 */
async function loadEditableQuestion(id: string) {
  const question = await db.query.questions.findFirst({
    where: eq(schema.questions.id, id),
    with: { survey: { columns: { status: true } } },
  });
  if (!question) throw new ApiError(404, 'Pergunta não encontrada.');
  if (question.survey.status !== 'DRAFT' && question.survey.status !== 'SCHEDULED') {
    throw new ApiError(409, 'Perguntas só podem ser alteradas com a pesquisa em rascunho ou agendada.');
  }
  return question;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const current = await loadEditableQuestion(params.id);

    const body = await req.json().catch(() => null);
    const parsed = questionBaseSchema.partial().extend({
      options: questionBaseSchema.shape.options.unwrap().max(50).optional(),
    }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    // `.partial()` pula a regra da escala: confere aqui, sobre o resultado final.
    const type = parsed.data.type ?? current.type;
    const scaleMin = parsed.data.scaleMin !== undefined ? parsed.data.scaleMin : current.scaleMin;
    const scaleMax = parsed.data.scaleMax !== undefined ? parsed.data.scaleMax : current.scaleMax;
    if (type === 'SCALE' && (scaleMin == null || scaleMax == null || scaleMin >= scaleMax)) {
      throw new ApiError(400, 'Perguntas do tipo Escala precisam de um mínimo e máximo válidos (mínimo menor que máximo).');
    }

    const { options, ...rest } = parsed.data;
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.questions).set(rest).where(eq(schema.questions.id, params.id)).returning();
      if (options) {
        await tx.delete(schema.questionOptions).where(eq(schema.questionOptions.questionId, updated.id));
        if (options.length > 0) {
          await tx.insert(schema.questionOptions).values(
            options.map((o, idx) => ({ questionId: updated.id, label: o.label, order: o.order ?? idx }))
          );
        }
      }
      return updated;
    });

    await logAudit({ adminId: session.adminId, action: 'question.update', entityType: 'Question', entityId: row.id, req });
    return NextResponse.json({ question: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    await loadEditableQuestion(params.id);
    // Soft-delete: preserva integridade referencial se já houver respostas.
    const [row] = await db.update(schema.questions).set({ active: false }).where(eq(schema.questions.id, params.id)).returning();

    await logAudit({ adminId: session.adminId, action: 'question.deactivate', entityType: 'Question', entityId: row.id, req });
    return NextResponse.json({ question: row });
  } catch (err) {
    return handleApiError(err);
  }
}
