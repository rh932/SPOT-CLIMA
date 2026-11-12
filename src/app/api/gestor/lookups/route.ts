export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';
import { hasPermission } from '@/lib/permissions';

/**
 * Listas para o formulário de cadastro do portal da operação. As unidades e
 * turnos vêm limitados ao escopo — a tela não oferece o que o servidor recusaria.
 *
 * `?para=feedback` é o cadastro de colaborador antigo, feito na aba Feedback:
 * em vez dos setores do treinamento (Salão), traz os setores do escopo que
 * fazem feedback. Só para quem avalia.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.create');

    // Quem avalia cadastra em qualquer setor do escopo; quem só treina, só no Salão.
    const avalia = hasPermission(session.role, 'evaluations.view');
    const paraFeedback = req.nextUrl.searchParams.get('para') === 'feedback';
    if (paraFeedback) requirePermission(session, 'evaluations.view');

    const [sectors, units] = await Promise.all([
      session.scopedSectorIds.length
        ? db.query.sectors.findMany({
          where: and(
            eq(schema.sectors.active, true),
            eq(schema.sectors.inEvaluation, true),
            // O cadastro padrão é o do treinamento (só o Salão); o de antigos, o dos setores com feedback.
            paraFeedback
              ? or(eq(schema.sectors.usesFeedback, true), eq(schema.sectors.usesColorCycle, true))
              : eq(schema.sectors.inTraining, true),
            inArray(schema.sectors.id, session.scopedSectorIds),
          ),
          orderBy: asc(schema.sectors.order),
          columns: { id: true, name: true },
        })
        : Promise.resolve([]),
      session.scopedUnitIds.length
        ? db.query.units.findMany({
          where: and(eq(schema.units.active, true), inArray(schema.units.id, session.scopedUnitIds)),
          orderBy: asc(schema.units.order),
          columns: { id: true, name: true },
        })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({ sectors, units, shifts: session.scopedShifts, canChooseTrack: avalia });
  } catch (err) {
    return handleApiError(err);
  }
}
