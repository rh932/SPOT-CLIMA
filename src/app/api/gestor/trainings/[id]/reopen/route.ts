export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireGestor, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { isInScope } from '@/lib/scope';
import { reopenTraining } from '@/lib/trainingClosure';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Reabre um treinamento encerrado em definitivo, do lado da operação.
 *
 * Quem tem `trainings.reopen` aqui é o Gestor Líder — quem registrou o
 * treinamento não desfaz o próprio encerramento, senão "definitivo" não
 * significa nada. E ele só reabre dentro do escopo dele.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'trainings.reopen');

    const { training, employee, trainingType } = await reopenTraining({
      trainingId: params.id,
      adminId: session.adminId,
      assertAllowed: (emp) => {
        if (!isInScope(session, emp)) {
          throw new ApiError(403, 'Este colaborador não está no seu escopo.');
        }
      },
    });

    await logAudit({
      adminId: session.adminId,
      action: 'training.reopen',
      entityType: 'Training',
      entityId: training.id,
      metadata: { employeeId: employee?.id ?? null, trainingType: trainingType?.name ?? null, origem: 'gestor' },
      req,
    });

    if (employee) {
      await notifyActivity({
        type: 'TRAINING_REOPENED',
        employee,
        trainingType: trainingType?.name ?? 'treinamento',
        trainerAdminId: training.trainerAdminId,
      }, session.adminId);
    }

    return NextResponse.json({ training });
  } catch (err) {
    return handleApiError(err);
  }
}
