export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';

/** Tipos de treinamento ativos, com os materiais de apoio já cadastrados. */
export async function GET() {
  try {
    const session = await requireGestor();
    requirePermission(session, 'trainings.view');

    const rows = await db.query.trainingTypes.findMany({
      where: eq(schema.trainingTypes.active, true),
      orderBy: asc(schema.trainingTypes.order),
      with: {
        criteria: { columns: { id: true, label: true, hint: true, order: true, active: true } },
        materials: {
          columns: { id: true, title: true, imageDataUri: true, instructions: true, order: true },
        },
      },
    });

    return NextResponse.json({ trainingTypes: rows });
  } catch (err) {
    return handleApiError(err);
  }
}
