export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { requireGestor, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { isInScope } from '@/lib/scope';
import { respostaDaFoto } from '@/lib/employeePhoto';

/** Foto do colaborador para o portal do gestor — só de quem está no escopo dele. */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.view');
    const employee = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, id),
      columns: { id: true, unitId: true, sectorId: true, shift: true },
    });
    if (!employee || !isInScope(session, employee)) throw new ApiError(404, 'Sem foto.');
    return await respostaDaFoto(id);
  } catch (err) {
    return handleApiError(err);
  }
}
