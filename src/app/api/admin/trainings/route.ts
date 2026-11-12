export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';

/** Acompanhamento dos treinamentos, para o painel administrativo. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'trainings.view');

    const typeId = req.nextUrl.searchParams.get('typeId')?.slice(0, 64);
    // Valor fora do enum ia direto para o Postgres e virava erro 500.
    const resultParam = req.nextUrl.searchParams.get('result');
    const result = (['APROVADO', 'APROVADO_COM_RESSALVA', 'REPROVADO'] as const).find((r) => r === resultParam);
    const reinforcement = req.nextUrl.searchParams.get('reinforcement');

    const rows = await db.query.trainings.findMany({
      where: and(
        typeId ? eq(schema.trainings.trainingTypeId, typeId) : undefined,
        result ? eq(schema.trainings.result, result as 'APROVADO' | 'APROVADO_COM_RESSALVA' | 'REPROVADO') : undefined,
        reinforcement === 'true' ? eq(schema.trainings.needsReinforcement, true) : undefined,
      ),
      orderBy: desc(schema.trainings.trainingDate),
      limit: 300,
      with: {
        employee: {
          columns: { id: true, fullName: true, roleDescription: true, shift: true },
          with: { sector: { columns: { name: true } }, unit: { columns: { name: true } } },
        },
        trainingType: { columns: { id: true, name: true, positiveLabel: true, negativeLabel: true } },
        trainer: { columns: { id: true, name: true } },
        reopenedBy: { columns: { id: true, name: true } },
        answers: { with: { criterion: { columns: { id: true, label: true, hint: true, order: true } } } },
      },
    });

    return NextResponse.json({ trainings: rows });
  } catch (err) {
    return handleApiError(err);
  }
}
