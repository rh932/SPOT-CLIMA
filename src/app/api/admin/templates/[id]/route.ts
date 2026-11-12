export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { questionTemplateSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const template = await db.query.questionTemplates.findFirst({
      where: eq(schema.questionTemplates.id, params.id),
      with: { category: true },
    });
    if (!template) throw new ApiError(404, 'Modelo não encontrado.');

    const questions = await db.query.templateQuestions.findMany({
      where: and(eq(schema.templateQuestions.templateId, params.id), eq(schema.templateQuestions.active, true)),
      orderBy: asc(schema.templateQuestions.order),
      with: { dimension: true, options: { orderBy: (o, { asc }) => asc(o.order) } },
    });

    return NextResponse.json({ template, questions });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const body = await req.json().catch(() => null);
    const parsed = questionTemplateSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db
      .update(schema.questionTemplates)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.questionTemplates.id, params.id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'template.update', entityType: 'QuestionTemplate', entityId: row.id, req });
    return NextResponse.json({ template: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);

    if (req.nextUrl.searchParams.get('hard') === 'true') {
      // Seguro sempre: pesquisas criadas a partir de um modelo copiam as perguntas
      // (sourceTemplateId é só um texto de referência, sem FK) — excluir o modelo
      // nunca afeta pesquisas já criadas. template_questions/options são removidas em cascata.
      const [row] = await db.delete(schema.questionTemplates).where(eq(schema.questionTemplates.id, params.id)).returning();
      if (!row) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 });

      await logAudit({ adminId: session.adminId, action: 'template.delete', entityType: 'QuestionTemplate', entityId: row.id, req });
      return NextResponse.json({ ok: true });
    }

    // Soft-delete (padrão): preserva o modelo desativado, sem apagar suas perguntas.
    const [row] = await db
      .update(schema.questionTemplates)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.questionTemplates.id, params.id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'template.deactivate', entityType: 'QuestionTemplate', entityId: row.id, req });
    return NextResponse.json({ template: row });
  } catch (err) {
    return handleApiError(err);
  }
}
