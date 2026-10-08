export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSurveyResults, getCommentAnalysis } from '@/lib/results';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';

/**
 * Resultados agregados. As travas de anonimato (pesquisa aberta, limite
 * mínimo, grupos ocultos) são aplicadas dentro de getSurveyResults — esta rota
 * nunca vê números que não podem sair.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'reports.view');
    const [results, comments] = await Promise.all([getSurveyResults(params.id), getCommentAnalysis(params.id)]);
    if (!results || !comments) throw new ApiError(404, 'Pesquisa não encontrada.');
    return NextResponse.json({ results, comments });
  } catch (err) {
    return handleApiError(err);
  }
}
