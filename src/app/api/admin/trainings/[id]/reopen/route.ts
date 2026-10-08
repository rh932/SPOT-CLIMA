export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { reopenTraining } from '@/lib/trainingClosure';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Reabre um treinamento encerrado em definitivo, do lado do RH.
 *
 * Mesma operação da rota do gestor, sem recorte de escopo: o RH enxerga a
 * operação inteira.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'trainings.reopen');

    const { training, employee, trainingType } = await reopenTraining({
      trainingId: params.id,
      adminId: session.adminId,
    });

    await logAudit({
      adminId: session.adminId,
      action: 'training.reopen',
      entityType: 'Training',
      entityId: training.id,
      metadata: { employeeId: employee?.id ?? null, trainingType: trainingType?.name ?? null, origem: 'admin' },
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
