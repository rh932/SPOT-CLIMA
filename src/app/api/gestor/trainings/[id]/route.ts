export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireGestor, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { isInScope } from '@/lib/scope';
import { logAudit } from '@/lib/audit';
import { ARQUIVO_APOS_MESES, noArquivo } from '@/lib/gestorEquipe';

/**
 * Apaga UM treinamento do arquivo (mais de ARQUIVO_APOS_MESES meses).
 *
 * Só quem supervisiona (`trainings.reopen`: Gestor Líder, RH) apaga, e só
 * dentro do próprio escopo. A data é conferida aqui: um treinamento recente
 * não some por chamada direta, mesmo que a tela não ofereça o botão.
 */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'trainings.reopen');

    const training = await db.query.trainings.findFirst({
      where: eq(schema.trainings.id, params.id),
      columns: { id: true, trainingDate: true, closure: true },
      with: {
        employee: { columns: { id: true, fullName: true, unitId: true, sectorId: true, shift: true } },
        trainingType: { columns: { id: true, name: true } },
      },
    });
    if (!training) throw new ApiError(404, 'Treinamento não encontrado.');
    if (!training.employee || !isInScope(session, training.employee)) {
      throw new ApiError(403, 'Este treinamento não está no seu escopo.');
    }
    if (!noArquivo(training.trainingDate)) {
      throw new ApiError(409, `Só dá para apagar treinamentos do arquivo, com mais de ${ARQUIVO_APOS_MESES} meses.`);
    }

    await db.delete(schema.trainings).where(eq(schema.trainings.id, params.id));

    await logAudit({
      adminId: session.adminId,
      action: 'training.delete',
      entityType: 'Training',
      entityId: params.id,
      metadata: {
        employeeId: training.employee.id,
        trainingType: training.trainingType?.name ?? null,
        closure: training.closure,
        origem: 'arquivo-gestor',
      },
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
