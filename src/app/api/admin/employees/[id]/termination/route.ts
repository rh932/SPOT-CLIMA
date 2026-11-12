export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { terminationSchema } from '@/lib/validation';
import { registrarSaida, desfazerSaida } from '@/lib/terminationService';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Desligamento registrado pelo RH, com motivo e data.
 *
 * Antes só a avaliação com conclusão "Demitir" desligava alguém; quem pedia
 * demissão ou abandonava o emprego no meio da experiência ficava na lista
 * como "Aguardando 1º ciclo" e continuava gerando lembrete para o gestor.
 * Também serve para corrigir motivo e data de um desligamento já registrado.
 * O gestor tem a rota dele (/api/gestor/employees/[id]/termination), com a
 * mesma regra (src/lib/terminationService.ts) e limitada ao escopo.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.edit');

    const body = await req.json().catch(() => null);
    const parsed = terminationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }

    const row = await registrarSaida(params.id, parsed.data, () => true);

    await logAudit({
      adminId: session.adminId,
      action: 'employee.terminate',
      entityType: 'ProbationaryEmployee',
      entityId: row.id,
      metadata: { reason: parsed.data.reason, date: parsed.data.date },
      req,
    });
    await notifyActivity({ type: 'EMPLOYEE_UPDATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Desfaz um desligamento lançado por engano (regra em desfazerSaida). */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.edit');

    const row = await desfazerSaida(params.id, () => true);

    await logAudit({ adminId: session.adminId, action: 'employee.unterminate', entityType: 'ProbationaryEmployee', entityId: row.id, req });
    await notifyActivity({ type: 'EMPLOYEE_UPDATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row });
  } catch (err) {
    return handleApiError(err);
  }
}
