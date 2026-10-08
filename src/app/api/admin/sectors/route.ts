export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireAnyPermission, handleApiError } from '@/lib/apiAuth';
import { sectorSchema } from '@/lib/validation';
import { defaultUsesColorCycle, defaultInTraining } from '@/lib/sectors';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['employees.view', 'surveys.manage', 'reports.view']);
    const rows = await db.query.sectors.findMany({ orderBy: asc(schema.sectors.order) });
    return NextResponse.json({ sectors: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');
    const body = await req.json().catch(() => null);
    const parsed = sectorSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    // Setor que começa com "Salão" já nasce no ciclo de cores — regra do
    // restaurante. Continua editável depois, na própria tela de Setores.
    const [row] = await db
      .insert(schema.sectors)
      .values({
        ...parsed.data,
        usesColorCycle: defaultUsesColorCycle(parsed.data.name, parsed.data.usesColorCycle),
        inTraining: defaultInTraining(parsed.data.name, parsed.data.inTraining),
      })
      .returning();
    await logAudit({ adminId: session.adminId, action: 'sector.create', entityType: 'Sector', entityId: row.id, req });
    return NextResponse.json({ sector: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
