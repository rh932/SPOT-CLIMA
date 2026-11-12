export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';
import { terminationSchema } from '@/lib/validation';
import { registrarSaida, desfazerSaida } from '@/lib/terminationService';
import { isInScope } from '@/lib/scope';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Saída do colaborador registrada pelo gestor — quem já não trabalha no Spot
 * vai para a aba Desligados e some das listas do dia a dia (Experiência,
 * Feedback, Pendências, Treinamento) e dos lembretes. O histórico fica.
 *
 * Só dentro do próprio escopo: mandar o id de alguém de outra loja/setor/turno
 * na mão devolve 403. O RH é avisado (EMPLOYEE_UPDATED) e pode corrigir.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.terminate');

    const body = await req.json().catch(() => null);
    const parsed = terminationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }

    const row = await registrarSaida(params.id, parsed.data, (e) => isInScope(session, e));

    await logAudit({
      adminId: session.adminId,
      action: 'employee.terminate',
      entityType: 'ProbationaryEmployee',
      entityId: row.id,
      metadata: { reason: parsed.data.reason, date: parsed.data.date, via: 'gestor' },
      req,
    });
    await notifyActivity({ type: 'EMPLOYEE_UPDATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Saída lançada por engano: a pessoa volta para a equipe com a situação de antes. */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.terminate');

    const row = await desfazerSaida(params.id, (e) => isInScope(session, e));

    await logAudit({ adminId: session.adminId, action: 'employee.unterminate', entityType: 'ProbationaryEmployee', entityId: row.id, metadata: { via: 'gestor' }, req });
    await notifyActivity({ type: 'EMPLOYEE_UPDATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row });
  } catch (err) {
    return handleApiError(err);
  }
}
