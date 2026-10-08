export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { unitSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');
    const body = await req.json().catch(() => null);
    const parsed = unitSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db.update(schema.units).set(parsed.data).where(eq(schema.units.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'unit.update', entityType: 'Unit', entityId: row.id, req });
    return NextResponse.json({ unit: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');

    if (req.nextUrl.searchParams.get('hard') === 'true') {
      const [inResponses, inActionPlans, inEmployees, inAdmins] = await Promise.all([
        db.query.surveyResponses.findFirst({ where: eq(schema.surveyResponses.unitId, params.id) }),
        db.query.actionPlans.findFirst({ where: eq(schema.actionPlans.unitId, params.id) }),
        db.query.probationaryEmployees.findFirst({ where: eq(schema.probationaryEmployees.unitId, params.id) }),
        db.query.adminUnits.findFirst({ where: eq(schema.adminUnits.unitId, params.id) }),
      ]);
      if (inResponses || inActionPlans || inEmployees || inAdmins) {
        return NextResponse.json({ error: 'Esta unidade está em uso (respostas, planos de ação, funcionários ou gestores) e não pode ser excluída. Desative-a em vez disso.' }, { status: 409 });
      }

      const [row] = await db.delete(schema.units).where(eq(schema.units.id, params.id)).returning();
      if (!row) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });

      await logAudit({ adminId: session.adminId, action: 'unit.delete', entityType: 'Unit', entityId: row.id, req });
      return NextResponse.json({ ok: true });
    }

    // Sem ?hard=true: comportamento padrão é só desativar (preserva histórico de pesquisas).
    const [row] = await db
      .update(schema.units)
      .set({ active: false })
      .where(eq(schema.units.id, params.id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'unit.deactivate', entityType: 'Unit', entityId: row.id, req });
    return NextResponse.json({ unit: row });
  } catch (err) {
    return handleApiError(err);
  }
}
