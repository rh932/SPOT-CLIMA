export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, inArray, lt } from 'drizzle-orm';
import { requireGestor, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { hasCompleteScope } from '@/lib/scope';
import { logAudit } from '@/lib/audit';
import { limiteArquivo } from '@/lib/gestorEquipe';
import { idsNoEscopoDoTreino } from '@/lib/trainingScope';

/**
 * Esvazia o arquivo de treinamentos: apaga, de uma vez, todos os treinamentos
 * do escopo com mais de ARQUIVO_APOS_MESES meses. Mesmo recorte e mesma
 * permissão da exclusão individual (`trainings.reopen`).
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'trainings.reopen');
    if (!hasCompleteScope(session)) {
      throw new ApiError(403, 'Sua conta não tem unidade/setor/turno definidos. Contate um administrador.');
    }

    const idsNoEscopo = await idsNoEscopoDoTreino(session);
    if (idsNoEscopo.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

    const arquivados = await db.query.trainings.findMany({
      where: and(
        inArray(schema.trainings.employeeId, idsNoEscopo),
        lt(schema.trainings.trainingDate, limiteArquivo()),
      ),
      columns: { id: true },
    });
    if (arquivados.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

    await db.delete(schema.trainings).where(inArray(schema.trainings.id, arquivados.map((t) => t.id)));

    await logAudit({
      adminId: session.adminId,
      action: 'training.archive.delete',
      entityType: 'Training',
      entityId: 'arquivo',
      metadata: { deleted: arquivados.length, origem: 'arquivo-gestor' },
      req,
    });

    return NextResponse.json({ ok: true, deleted: arquivados.length });
  } catch (err) {
    return handleApiError(err);
  }
}
