export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { questionBaseSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { enpsQuestionFields } from '@/lib/enps';

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

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const current = await loadEditableQuestion(params.id);

    const body = await req.json().catch(() => null);
    const parsed = questionBaseSchema.partial().extend({
      options: questionBaseSchema.shape.options.unwrap().max(50).optional(),
    }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    // eNPS fixa a escala em 0–10 (src/lib/enps.ts) e só existe uma por pesquisa.
    const isEnps = parsed.data.isEnps ?? current.isEnps;
    const data = isEnps ? { ...enpsQuestionFields({ ...parsed.data, isEnps: true }), options: [] } : parsed.data;
    // Vale também para reativar uma eNPS removida enquanto outra está ativa
    // (o índice questions_enps_ativa_por_pesquisa_idx barra no banco de todo jeito).
    const ficaAtiva = parsed.data.active ?? current.active;
    if (isEnps && ficaAtiva && (!current.isEnps || !current.active)) {
      const outra = await db.query.questions.findFirst({
        where: and(
          eq(schema.questions.surveyId, current.surveyId),
          eq(schema.questions.isEnps, true),
          eq(schema.questions.active, true),
          ne(schema.questions.id, current.id),
        ),
        columns: { id: true },
      });
      if (outra) throw new ApiError(409, 'Esta pesquisa já tem uma pergunta de eNPS.');
    }

    // `.partial()` pula a regra da escala: confere aqui, sobre o resultado final.
    const type = data.type ?? current.type;
    const scaleMin = data.scaleMin !== undefined ? data.scaleMin : current.scaleMin;
    const scaleMax = data.scaleMax !== undefined ? data.scaleMax : current.scaleMax;
    if (type === 'SCALE' && (scaleMin == null || scaleMax == null || scaleMin >= scaleMax)) {
      throw new ApiError(400, 'Perguntas do tipo Escala precisam de um mínimo e máximo válidos (mínimo menor que máximo).');
    }

    const { options, ...rest } = data;
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

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
