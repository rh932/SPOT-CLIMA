export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError } from '@/lib/apiAuth';
import { templateCategorySchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const rows = await db.query.templateCategories.findMany({ orderBy: asc(schema.templateCategories.order) });
    return NextResponse.json({ categories: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const body = await req.json().catch(() => null);
    const parsed = templateCategorySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db.insert(schema.templateCategories).values(parsed.data).returning();
    await logAudit({ adminId: session.adminId, action: 'template_category.create', entityType: 'TemplateCategory', entityId: row.id, req });
    return NextResponse.json({ category: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
