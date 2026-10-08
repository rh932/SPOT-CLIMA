export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireAnyPermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { questionSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { enpsQuestionFields } from '@/lib/enps';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['surveys.manage', 'reports.view']);
    const rows = await db.query.questions.findMany({
      where: eq(schema.questions.surveyId, params.id),
      orderBy: asc(schema.questions.order),
      with: { dimension: true, options: { orderBy: (o, { asc }) => asc(o.order) } },
    });
    return NextResponse.json({ questions: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status !== 'DRAFT' && survey.status !== 'SCHEDULED') {
      throw new ApiError(400, 'Só é possível adicionar perguntas a pesquisas em rascunho ou agendadas.');
    }

    const body = await req.json().catch(() => null);
    const parsed = questionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 400 });
    const data = enpsQuestionFields(parsed.data);

    const existing = await db.query.questions.findMany({ where: eq(schema.questions.surveyId, params.id) });
    if (data.isEnps && existing.some((q) => q.active && q.isEnps)) {
      throw new ApiError(409, 'Esta pesquisa já tem uma pergunta de eNPS.');
    }
    const order = data.order ?? existing.length + 1;

    const [row] = await db
      .insert(schema.questions)
      .values({
        surveyId: params.id,
        dimensionId: data.dimensionId ?? null,
        text: data.text,
        type: data.type,
        required: data.required ?? true,
        order,
        active: data.active ?? true,
        scaleMin: data.scaleMin ?? null,
        scaleMax: data.scaleMax ?? null,
        isEnps: data.isEnps ?? false,
      })
      .returning();

    if (!data.isEnps && data.options && data.options.length > 0) {
      await db.insert(schema.questionOptions).values(
        data.options.map((o, idx) => ({ questionId: row.id, label: o.label, order: o.order ?? idx }))
      );
    }

    await logAudit({ adminId: session.adminId, action: 'question.create', entityType: 'Question', entityId: row.id, req });
    return NextResponse.json({ question: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
