export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { sectorSchema } from '@/lib/validation';
import { defaultUsesColorCycle } from '@/lib/sectors';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');
    const body = await req.json().catch(() => null);
    const parsed = sectorSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    // Renomear para "Salão ..." também coloca o setor no ciclo de cores, pela
    // mesma regra da criação. Alterações que não mexem no nome (ativar,
    // reordenar) não tocam na chave, e marcar/desmarcar o ciclo direto na tela
    // sempre vence.
    const values = parsed.data.name !== undefined
      ? { ...parsed.data, usesColorCycle: defaultUsesColorCycle(parsed.data.name, parsed.data.usesColorCycle) }
      : parsed.data;

    const [row] = await db.update(schema.sectors).set(values).where(eq(schema.sectors.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Setor não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'sector.update', entityType: 'Sector', entityId: row.id, req });
    return NextResponse.json({ sector: row });
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
        db.query.surveyResponses.findFirst({ where: eq(schema.surveyResponses.sectorId, params.id) }),
        db.query.actionPlans.findFirst({ where: eq(schema.actionPlans.sectorId, params.id) }),
        db.query.probationaryEmployees.findFirst({ where: eq(schema.probationaryEmployees.sectorId, params.id) }),
        db.query.adminSectors.findFirst({ where: eq(schema.adminSectors.sectorId, params.id) }),
      ]);
      if (inResponses || inActionPlans || inEmployees || inAdmins) {
        return NextResponse.json({ error: 'Este setor está em uso (respostas, planos de ação, funcionários ou gestores) e não pode ser excluído. Desative-o em vez disso.' }, { status: 409 });
      }

      const [row] = await db.delete(schema.sectors).where(eq(schema.sectors.id, params.id)).returning();
      if (!row) return NextResponse.json({ error: 'Setor não encontrado.' }, { status: 404 });

      await logAudit({ adminId: session.adminId, action: 'sector.delete', entityType: 'Sector', entityId: row.id, req });
      return NextResponse.json({ ok: true });
    }

    // Sem ?hard=true: comportamento padrão é só desativar (preserva histórico de pesquisas).
    const [row] = await db
      .update(schema.sectors)
      .set({ active: false })
      .where(eq(schema.sectors.id, params.id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Setor não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'sector.deactivate', entityType: 'Sector', entityId: row.id, req });
    return NextResponse.json({ sector: row });
  } catch (err) {
    return handleApiError(err);
  }
}
