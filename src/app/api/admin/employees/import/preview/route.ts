export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { ADMIN_ROLES } from '@/lib/permissions';
import { readEmployeeUpload } from '@/lib/upload';
import { parseCsv, readXlsxMatrix, previewEmployeeRows, type Cell } from '@/lib/importFuncionarios';

/**
 * Prévia da importação em massa: lê a planilha, confere cada linha contra o
 * banco e devolve o que seria importado, o que é duplicado e o que tem erro.
 * NÃO grava nada — quem grava é a rota de confirmação.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requireRole(session, ADMIN_ROLES);
    requirePermission(session, 'employees.create');

    const upload = await readEmployeeUpload(req);
    let matrix: Cell[][];
    try {
      matrix = upload.kind === 'xlsx' ? await readXlsxMatrix(upload.buffer) : parseCsv(upload.text);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'Não foi possível ler a planilha.');
    }

    const [units, sectors, existing] = await Promise.all([
      db.query.units.findMany({ where: eq(schema.units.active, true), columns: { id: true, name: true } }),
      db.query.sectors.findMany({
        where: and(eq(schema.sectors.active, true), eq(schema.sectors.inEvaluation, true)),
        columns: { id: true, name: true },
      }),
      db.query.probationaryEmployees.findMany({ columns: { fullName: true, unitId: true } }),
    ]);

    return NextResponse.json(previewEmployeeRows(matrix, { units, sectors, existing }));
  } catch (err) {
    return handleApiError(err);
  }
}
