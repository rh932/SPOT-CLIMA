export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { templateQuestionSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const rows = await db.query.templateQuestions.findMany({
      where: and(eq(schema.templateQuestions.templateId, params.id), eq(schema.templateQuestions.active, true)),
      orderBy: asc(schema.templateQuestions.order),
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
    requireRole(session, ['SUPER_ADMIN']);
    const template = await db.query.questionTemplates.findFirst({ where: eq(schema.questionTemplates.id, params.id) });
    if (!template) throw new ApiError(404, 'Modelo não encontrado.');

    const body = await req.json().catch(() => null);
    const parsed = templateQuestionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 400 });

    const existing = await db.query.templateQuestions.findMany({ where: eq(schema.templateQuestions.templateId, params.id) });
    // Maior ordem + 1, não a contagem: depois de uma exclusão a contagem repete
    // a posição de uma pergunta existente e a troca ↑/↓ entre as duas não anda.
    const order = parsed.data.order ?? Math.max(0, ...existing.map((q) => q.order)) + 1;

    const [row] = await db
      .insert(schema.templateQuestions)
      .values({
        templateId: params.id,
        dimensionId: parsed.data.dimensionId ?? null,
        text: parsed.data.text,
        type: parsed.data.type,
        required: parsed.data.required ?? true,
        order,
        active: parsed.data.active ?? true,
        scaleMin: parsed.data.scaleMin ?? null,
        scaleMax: parsed.data.scaleMax ?? null,
      })
      .returning();

    if (parsed.data.options && parsed.data.options.length > 0) {
      await db.insert(schema.templateQuestionOptions).values(
        parsed.data.options.map((o, idx) => ({ templateQuestionId: row.id, label: o.label, order: o.order ?? idx }))
      );
    }

    await logAudit({ adminId: session.adminId, action: 'template_question.create', entityType: 'TemplateQuestion', entityId: row.id, req });
    return NextResponse.json({ question: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
