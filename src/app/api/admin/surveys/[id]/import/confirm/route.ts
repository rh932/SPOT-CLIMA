export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { findOrCreateDimension } from '@/lib/importQuestions';
import { importRowsSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status !== 'DRAFT' && survey.status !== 'SCHEDULED') {
      throw new ApiError(400, 'Só é possível importar perguntas em pesquisas de rascunho ou agendadas.');
    }

    // As linhas voltam do navegador depois do preview: valida de novo aqui,
    // com os mesmos limites do cadastro manual.
    const parsed = importRowsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Nenhuma linha válida para importar.', details: parsed.error.flatten() }, { status: 400 });
    }
    const rows = parsed.data.rows;

    const existing = await db.query.questions.findMany({ where: eq(schema.questions.surveyId, params.id) });
    let order = existing.length;
    let count = 0;

    for (const row of rows) {
      order += 1;
      const dimensionId = row.categoria ? (await findOrCreateDimension(row.categoria)).id : null;
      const [inserted] = await db
        .insert(schema.questions)
        .values({
          surveyId: params.id,
          dimensionId,
          text: row.text,
          type: row.type,
          scaleMin: row.type === 'SCALE' ? 1 : null,
          scaleMax: row.type === 'SCALE' ? 10 : null,
          required: row.required,
          order,
        })
        .returning();
      if (row.options && row.options.length > 0) {
        await db.insert(schema.questionOptions).values(
          row.options.map((label, idx) => ({ questionId: inserted.id, label, order: idx }))
        );
      }
      count += 1;
    }

    await logAudit({
      adminId: session.adminId,
      action: 'survey.import_questions',
      entityType: 'Survey',
      entityId: params.id,
      metadata: { count },
      req,
    });

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return handleApiError(err);
  }
}
