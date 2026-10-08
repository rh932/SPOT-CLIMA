export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { dimensionSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const body = await req.json().catch(() => null);
    const parsed = dimensionSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db.update(schema.dimensions).set(parsed.data).where(eq(schema.dimensions.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Dimensão não encontrada.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'dimension.update', entityType: 'Dimension', entityId: row.id, req });
    return NextResponse.json({ dimension: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');

    if (req.nextUrl.searchParams.get('hard') === 'true') {
      const [inQuestions, inTemplateQuestions, inActionPlans] = await Promise.all([
        db.query.questions.findFirst({ where: eq(schema.questions.dimensionId, params.id) }),
        db.query.templateQuestions.findFirst({ where: eq(schema.templateQuestions.dimensionId, params.id) }),
        db.query.actionPlans.findFirst({ where: eq(schema.actionPlans.dimensionId, params.id) }),
      ]);
      if (inQuestions || inTemplateQuestions || inActionPlans) {
        return NextResponse.json({ error: 'Esta dimensão está em uso (perguntas, modelos ou planos de ação) e não pode ser excluída. Desative-a em vez disso.' }, { status: 409 });
      }

      const [row] = await db.delete(schema.dimensions).where(eq(schema.dimensions.id, params.id)).returning();
      if (!row) return NextResponse.json({ error: 'Dimensão não encontrada.' }, { status: 404 });

      await logAudit({ adminId: session.adminId, action: 'dimension.delete', entityType: 'Dimension', entityId: row.id, req });
      return NextResponse.json({ ok: true });
    }

    const [row] = await db
      .update(schema.dimensions)
      .set({ active: false })
      .where(eq(schema.dimensions.id, params.id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Dimensão não encontrada.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'dimension.deactivate', entityType: 'Dimension', entityId: row.id, req });
    return NextResponse.json({ dimension: row });
  } catch (err) {
    return handleApiError(err);
  }
}
