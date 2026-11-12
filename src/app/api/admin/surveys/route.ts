export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireAnyPermission, handleApiError } from '@/lib/apiAuth';
import { surveySchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['surveys.manage', 'reports.view']);
    const rows = await db.query.surveys.findMany({ orderBy: desc(schema.surveys.createdAt) });
    return NextResponse.json({ surveys: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const body = await req.json().catch(() => null);
    const parsed = surveySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 400 });

    const [row] = await db
      .insert(schema.surveys)
      .values({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        openDate: parsed.data.openDate ? new Date(parsed.data.openDate) : null,
        closeDate: parsed.data.closeDate ? new Date(parsed.data.closeDate) : null,
        eligiblePopulation: parsed.data.eligiblePopulation ?? null,
        anonymityThreshold: parsed.data.anonymityThreshold ?? 5,
        status: 'DRAFT',
      })
      .returning();

    await logAudit({ adminId: session.adminId, action: 'survey.create', entityType: 'Survey', entityId: row.id, metadata: { name: row.name }, req });
    return NextResponse.json({ survey: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
