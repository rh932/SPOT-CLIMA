import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, inArray } from 'drizzle-orm';
import { trainingSectorIds } from './apiAuth';

/**
 * Ids dos colaboradores do treinamento que estão no escopo de quem pede: a
 * unidade, o turno e os setores de treinamento (Salão). Vazio quando não há
 * ninguém — um `inArray` vazio no Drizzle devolveria a tabela inteira.
 */
export async function idsNoEscopoDoTreino(scope: {
  scopedUnitIds: string[];
  scopedSectorIds: string[];
  scopedShifts: string[];
}): Promise<string[]> {
  const setoresTreino = await trainingSectorIds(scope.scopedSectorIds);
  if (setoresTreino.length === 0 || scope.scopedUnitIds.length === 0 || scope.scopedShifts.length === 0) return [];
  const rows = await db.query.probationaryEmployees.findMany({
    where: and(
      inArray(schema.probationaryEmployees.unitId, scope.scopedUnitIds),
      inArray(schema.probationaryEmployees.sectorId, setoresTreino),
      inArray(schema.probationaryEmployees.shift, scope.scopedShifts as ('DIA' | 'NOITE')[]),
    ),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}
