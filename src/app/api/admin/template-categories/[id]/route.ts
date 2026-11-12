export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError } from '@/lib/apiAuth';
import { templateCategorySchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const body = await req.json().catch(() => null);
    const parsed = templateCategorySchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db.update(schema.templateCategories).set(parsed.data).where(eq(schema.templateCategories.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'template_category.update', entityType: 'TemplateCategory', entityId: row.id, req });
    return NextResponse.json({ category: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    // Nunca excluir fisicamente uma categoria com modelos associados — apenas desativar.
    const [row] = await db
      .update(schema.templateCategories)
      .set({ active: false })
      .where(eq(schema.templateCategories.id, params.id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'template_category.deactivate', entityType: 'TemplateCategory', entityId: row.id, req });
    return NextResponse.json({ category: row });
  } catch (err) {
    return handleApiError(err);
  }
}
