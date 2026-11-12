export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireGestor, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { isInScope } from '@/lib/scope';
import { colorChangeSchema } from '@/lib/validation';
import { changeEmployeeColor } from '@/lib/colorChange';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Reclassificação por cor feita na operação, fora de uma avaliação.
 *
 * Quem tem `employees.color.edit` é o Gestor (que avalia) e o Gestor Líder
 * (que acompanha e corrige) — o Treinador não entra nisto. O escopo continua
 * valendo: ninguém reclassifica alguém de fora do próprio recorte.
 *
 * Toda mudança exige motivo e vira linha em `employee_color_changes`, que é o
 * que responde depois "por que a cadência desta pessoa mudou?".
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.color.edit');

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
      origem: 'gestor',
      assertAllowed: (emp) => {
        if (!isInScope(session, emp)) {
          throw new ApiError(403, 'Este colaborador não está no seu escopo.');
        }
      },
    });

    await logAudit({
      adminId: session.adminId,
      action: 'employee.color.change',
      entityType: 'ProbationaryEmployee',
      entityId: employee.id,
      metadata: { de: previousColor, para: parsed.data.color, nextDueDate, origem: 'gestor' },
      req,
    });

    await notifyActivity({ type: 'COLOR_CHANGED', employee }, session.adminId);

    return NextResponse.json({ change, nextFeedbackDueDate: nextDueDate });
  } catch (err) {
    return handleApiError(err);
  }
}
