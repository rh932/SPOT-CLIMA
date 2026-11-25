export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { respostaDaFoto } from '@/lib/employeePhoto';

/** Foto do colaborador para o painel do RH/ADMIN. */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.view');
    return await respostaDaFoto(id);
  } catch (err) {
    return handleApiError(err);
  }
}
