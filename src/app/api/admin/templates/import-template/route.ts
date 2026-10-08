export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { buildQuestionsImportTemplate } from '@/lib/exportQuestionsTemplate';

export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const buffer = await buildQuestionsImportTemplate();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="modelo-importacao-perguntas.xlsx"',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
