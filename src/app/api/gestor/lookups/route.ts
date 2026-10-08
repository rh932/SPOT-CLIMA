export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';

/**
 * Listas para o formulário de cadastro do treinador. As unidades e turnos
 * vêm limitados ao escopo dele — a tela não oferece o que o servidor recusaria.
 */
export async function GET() {
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.create');

    const [sectors, units] = await Promise.all([
      session.scopedSectorIds.length
        ? db.query.sectors.findMany({
          where: and(
            eq(schema.sectors.active, true),
            eq(schema.sectors.inEvaluation, true),
            // O cadastro daqui é o do treinamento, que é só do Salão.
            eq(schema.sectors.inTraining, true),
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

    return NextResponse.json({ sectors, units, shifts: session.scopedShifts });
  } catch (err) {
    return handleApiError(err);
  }
}
