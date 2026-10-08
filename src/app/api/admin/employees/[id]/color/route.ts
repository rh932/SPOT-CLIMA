export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { colorChangeSchema } from '@/lib/validation';
import { changeEmployeeColor } from '@/lib/colorChange';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Correção da classificação por cor pelo RH.
 *
 * O caminho normal é o gestor definir a cor ao avaliar ou reclassificar pelo
 * portal da operação; isto aqui é a saída do RH para corrigir qualquer
 * colaborador, sem recorte de escopo. A regra de recálculo do prazo é a mesma
 * dos dois lados — ver `changeEmployeeColor()`.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.edit');

    const body = await req.json().catch(() => null);
    const parsed = colorChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Informe a nova cor e o motivo da mudança.' },
        { status: 400 },
      );
    }

    const { change, employee, nextDueDate, previousColor } = await changeEmployeeColor({
      employeeId: params.id,
      color: parsed.data.color,
      reason: parsed.data.reason,
      adminId: session.adminId,
      origem: 'admin',
    });

    await logAudit({
      adminId: session.adminId,
      action: 'employee.color.change',
      entityType: 'ProbationaryEmployee',
      entityId: employee.id,
      metadata: { de: previousColor, para: parsed.data.color, nextDueDate, origem: 'admin' },
      req,
    });

    await notifyActivity({ type: 'COLOR_CHANGED', employee }, session.adminId);

    return NextResponse.json({ change, nextFeedbackDueDate: nextDueDate });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Histórico de mudanças de classificação, da mais recente para a mais antiga. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.view');

    const changes = await db.query.employeeColorChanges.findMany({
      where: eq(schema.employeeColorChanges.employeeId, params.id),
      orderBy: desc(schema.employeeColorChanges.createdAt),
      with: { changedBy: { columns: { id: true, name: true } } },
    });
    return NextResponse.json({ changes });
  } catch (err) {
    return handleApiError(err);
  }
}
