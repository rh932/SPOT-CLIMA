export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { findOrCreateDimension } from '@/lib/importQuestions';
import { importRowsSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const template = await db.query.questionTemplates.findFirst({ where: eq(schema.questionTemplates.id, params.id) });
    if (!template) throw new ApiError(404, 'Modelo não encontrado.');

    // As linhas voltam do navegador depois do preview: valida de novo aqui,
    // com os mesmos limites do cadastro manual.
    const parsed = importRowsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Nenhuma linha válida para importar.', details: parsed.error.flatten() }, { status: 400 });
    }
    const rows = parsed.data.rows;

    const existing = await db.query.templateQuestions.findMany({ where: eq(schema.templateQuestions.templateId, params.id) });
    let order = Math.max(0, ...existing.map((q) => q.order));
    let count = 0;

    for (const row of rows) {
      order += 1;
      const dimensionId = row.categoria ? (await findOrCreateDimension(row.categoria)).id : null;
      const [inserted] = await db
        .insert(schema.templateQuestions)
        .values({
          templateId: params.id,
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
        await db.insert(schema.templateQuestionOptions).values(
          row.options.map((label, idx) => ({ templateQuestionId: inserted.id, label, order: idx }))
        );
      }
      count += 1;
    }

    await logAudit({
      adminId: session.adminId,
      action: 'template.import_questions',
      entityType: 'QuestionTemplate',
      entityId: params.id,
      metadata: { count },
      req,
    });

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return handleApiError(err);
  }
}
