export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError } from '@/lib/apiAuth';
import { questionTemplateSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const categoryId = req.nextUrl.searchParams.get('categoryId');
    const rows = await db.query.questionTemplates.findMany({
      where: categoryId ? eq(schema.questionTemplates.categoryId, categoryId) : undefined,
      orderBy: desc(schema.questionTemplates.createdAt),
      with: { category: true, questions: { where: (q, { eq }) => eq(q.active, true), columns: { id: true } } },
    });
    return NextResponse.json({
      templates: rows.map((t) => ({ ...t, questionCount: t.questions.length, questions: undefined })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const body = await req.json().catch(() => null);
    const parsed = questionTemplateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db
      .insert(schema.questionTemplates)
      .values({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        categoryId: parsed.data.categoryId ?? null,
        createdById: session.adminId,
      })
      .returning();

    await logAudit({ adminId: session.adminId, action: 'template.create', entityType: 'QuestionTemplate', entityId: row.id, req });
    return NextResponse.json({ template: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
