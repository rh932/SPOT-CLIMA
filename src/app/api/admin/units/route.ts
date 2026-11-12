export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireAnyPermission, handleApiError } from '@/lib/apiAuth';
import { unitSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['employees.view', 'surveys.manage', 'reports.view']);
    const rows = await db.query.units.findMany({ orderBy: asc(schema.units.order) });
    return NextResponse.json({ units: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');
    const body = await req.json().catch(() => null);
    const parsed = unitSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db.insert(schema.units).values(parsed.data).returning();
    await logAudit({ adminId: session.adminId, action: 'unit.create', entityType: 'Unit', entityId: row.id, req });
    return NextResponse.json({ unit: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
