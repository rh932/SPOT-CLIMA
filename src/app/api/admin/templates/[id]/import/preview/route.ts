export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { parseQuestionsWorkbook } from '@/lib/importQuestions';
import { readSpreadsheetUpload } from '@/lib/upload';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const template = await db.query.questionTemplates.findFirst({ where: eq(schema.questionTemplates.id, params.id) });
    if (!template) throw new ApiError(404, 'Modelo não encontrado.');

    const buffer = await readSpreadsheetUpload(req);
    const result = await parseQuestionsWorkbook(buffer);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
