export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireAnyPermission, handleApiError } from '@/lib/apiAuth';
import { dimensionSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['surveys.manage', 'reports.view']);
    const rows = await db.query.dimensions.findMany({ orderBy: asc(schema.dimensions.order) });
    return NextResponse.json({ dimensions: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const body = await req.json().catch(() => null);
    const parsed = dimensionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db.insert(schema.dimensions).values(parsed.data).returning();
    await logAudit({ adminId: session.adminId, action: 'dimension.create', entityType: 'Dimension', entityId: row.id, req });
    return NextResponse.json({ dimension: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
