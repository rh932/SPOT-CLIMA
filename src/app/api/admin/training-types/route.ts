export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { trainingTypeSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'trainings.view');

    const rows = await db.query.trainingTypes.findMany({
      orderBy: asc(schema.trainingTypes.order),
      with: { materials: { columns: { id: true, title: true, order: true } } },
    });
    return NextResponse.json({ trainingTypes: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'trainings.manage');

    const body = await req.json().catch(() => null);
    const parsed = trainingTypeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }

    const [row] = await db.insert(schema.trainingTypes).values(parsed.data).returning();
    await logAudit({ adminId: session.adminId, action: 'trainingType.create', entityType: 'TrainingType', entityId: row.id, req });
    // Formulário criado já desativado ainda não está disponível para ninguém.
    if (row.active) await notifyActivity({ type: 'TRAINING_TYPE_CREATED', trainingType: row.name }, session.adminId);
    return NextResponse.json({ trainingType: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
