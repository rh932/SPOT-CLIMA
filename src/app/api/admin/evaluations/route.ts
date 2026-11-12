export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';

/**
 * Histórico completo das avaliações de experiência e de feedback, de todos os
 * colaboradores, para o painel do RH/ADMIN. Cada avaliação é uma linha própria
 * (o portal nunca sobrescreve uma avaliação anterior), então a lista é o
 * registro permanente da evolução de cada colaborador.
 *
 * Só o resumo de cada linha sai daqui; o conteúdo completo (notas,
 * sub-respostas e textos) fica na ficha do colaborador, que já o mostra.
 */
export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.history.view');

    const rows = await db.query.performanceEvaluations.findMany({
      orderBy: desc(schema.performanceEvaluations.evaluationDate),
      columns: {
        id: true, period: true, cycleNumber: true, evaluationDate: true, dueDateAtEvaluation: true,
        classification: true, conclusion: true, color: true, source: true, evaluatorName: true,
      },
      with: {
        evaluator: { columns: { id: true, name: true } },
        employee: {
          columns: { id: true, fullName: true, roleDescription: true, shift: true, status: true, isApprentice: true },
          with: {
            sector: { columns: { id: true, name: true } },
            unit: { columns: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ evaluations: rows });
  } catch (err) {
    return handleApiError(err);
  }
}
