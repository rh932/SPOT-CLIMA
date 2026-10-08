export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Rota pública usada pela área do colaborador. Lista TODAS as pesquisas
 * abertas no momento (pode haver mais de uma ao mesmo tempo, ex. um tema mais
 * amplo rodando junto com um ciclo regular). Não requer autenticação.
 */
export async function GET() {
  const surveys = await db.query.surveys.findMany({
    where: eq(schema.surveys.status, 'OPEN'),
    orderBy: (s, { desc }) => desc(s.openDate),
  });

  return NextResponse.json({
    surveys: surveys.map((s) => ({ id: s.id, name: s.name, description: s.description })),
  });
}
