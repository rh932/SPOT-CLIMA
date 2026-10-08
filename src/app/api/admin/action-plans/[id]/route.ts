export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { actionPlanSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const body = await req.json().catch(() => null);
    const parsed = actionPlanSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const { dueDate, ...rest } = parsed.data;
    const updates: Partial<typeof schema.actionPlans.$inferInsert> = { ...rest };
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (parsed.data.status === 'DONE') updates.completedAt = new Date();

    const [row] = await db.update(schema.actionPlans).set(updates).where(eq(schema.actionPlans.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Plano de ação não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'action_plan.update', entityType: 'ActionPlan', entityId: row.id, req });
    return NextResponse.json({ actionPlan: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const [row] = await db.delete(schema.actionPlans).where(eq(schema.actionPlans.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Plano de ação não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'action_plan.delete', entityType: 'ActionPlan', entityId: row.id, req });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
