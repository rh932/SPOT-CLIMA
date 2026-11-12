export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireAnyPermission, handleApiError } from '@/lib/apiAuth';
import { actionPlanSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['surveys.manage', 'reports.view']);
    const rows = await db.query.actionPlans.findMany({
      orderBy: desc(schema.actionPlans.createdAt),
      // `createdBy: true` traria a linha inteira de admins — hash da senha e
      // e-mail de quem criou o plano (inclusive o Super Admin) para qualquer RH.
      with: { survey: true, dimension: true, sector: true, unit: true, createdBy: { columns: { id: true, name: true } } },
    });
    return NextResponse.json({ actionPlans: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const body = await req.json().catch(() => null);
    const parsed = actionPlanSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 400 });

    const [row] = await db
      .insert(schema.actionPlans)
      .values({
        surveyId: parsed.data.surveyId ?? null,
        problem: parsed.data.problem,
        dimensionId: parsed.data.dimensionId ?? null,
        sectorId: parsed.data.sectorId ?? null,
        unitId: parsed.data.unitId ?? null,
        priority: parsed.data.priority,
        action: parsed.data.action,
        owner: parsed.data.owner,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        status: parsed.data.status ?? 'NOT_STARTED',
        notes: parsed.data.notes ?? null,
        createdById: session.adminId,
      })
      .returning();

    await logAudit({ adminId: session.adminId, action: 'action_plan.create', entityType: 'ActionPlan', entityId: row.id, req });
    return NextResponse.json({ actionPlan: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
