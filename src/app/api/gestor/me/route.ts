export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireGestor, handleApiError } from '@/lib/apiAuth';
import { permissionsFor } from '@/lib/permissions';
import { hasCompleteScope } from '@/lib/scope';

/** Quem sou eu e o que posso — usado para montar o menu do portal. */
export async function GET() {
  try {
    const session = await requireGestor();
    return NextResponse.json({
      name: session.name,
      role: session.role,
      permissions: permissionsFor(session.role),
      hasScope: hasCompleteScope(session),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
