export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'audit.view');
    // A trilha mostra quem é cada admin (nome e e-mail) e o hash de IP de cada
    // ação: mesma regra da lista de usuários, só o Super Admin.
    requireRole(session, ['SUPER_ADMIN']);
    const pedido = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, 500) : 100;
    const rows = await db.query.auditLogs.findMany({
      orderBy: desc(schema.auditLogs.createdAt),
      limit,
      with: { admin: { columns: { name: true, email: true } } },
    });
    return NextResponse.json({ auditLogs: rows });
  } catch (err) {
    return handleApiError(err);
  }
}
