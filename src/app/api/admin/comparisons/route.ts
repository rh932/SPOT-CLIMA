export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { getSurveyResults } from '@/lib/results';
import { percentagePointDelta, trendFromDelta } from '@/lib/calculations';

/**
 * Comparação entre pesquisas ao longo do tempo (item 21 do briefing).
 * GET /api/admin/comparisons?ids=surveyId1,surveyId2,...  (ordem cronológica sugerida)
 */
const MAX_SURVEYS = 12;

export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'reports.view');
    const ids = Array.from(new Set((req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean)));
    if (ids.length < 2) {
      return NextResponse.json({ error: 'Informe ao menos duas pesquisas para comparar (?ids=a,b).' }, { status: 400 });
    }
    // Cada pesquisa carrega todas as respostas: sem teto, uma chamada só
    // derrubava o servidor.
    if (ids.length > MAX_SURVEYS || ids.some((id) => !/^[\w-]{1,64}$/.test(id))) {
      throw new ApiError(400, `Compare no máximo ${MAX_SURVEYS} pesquisas por vez.`);
    }

    const allResults = await Promise.all(ids.map((id) => getSurveyResults(id)));
    const valid = allResults.filter((r): r is NonNullable<typeof r> => r !== null);
    if (valid.length < 2) {
      return NextResponse.json({ error: 'Uma ou mais pesquisas não foram encontradas.' }, { status: 404 });
    }
    // Pesquisa com resultado travado (aberta ou abaixo do limite) não entra:
    // o índice dela seria 0 no gráfico, e com a pesquisa aberta seria o ataque
    // por diferença de novo, agora pela tela de comparação.
    const locked = valid.filter((r) => r.locked);
    if (locked.length > 0) {
      throw new ApiError(
        409,
        `Não dá para comparar ${locked.map((r) => `"${r.surveyName}"`).join(', ')}: ${locked[0].lockedReason}`,
      );
    }

    // Ordena por data de criação implícita (ordem enviada pelo usuário é respeitada).
    const overallSeries = valid.map((r) => ({ surveyId: r.surveyId, surveyName: r.surveyName, index: r.climateIndex }));

    const dimensionNames = Array.from(new Set(valid.flatMap((r) => r.byDimension.map((d) => d.dimension))));
    const byDimension = dimensionNames.map((name) => {
      const series = valid.map((r) => {
        const found = r.byDimension.find((d) => d.dimension === name);
        return { surveyId: r.surveyId, surveyName: r.surveyName, index: found?.index ?? null };
      });
      const first = series.find((s) => s.index !== null)?.index ?? null;
      const last = [...series].reverse().find((s) => s.index !== null)?.index ?? null;
      const delta = first !== null && last !== null ? percentagePointDelta(last, first) : null;
      return {
        dimension: name,
        series,
        delta,
        trend: delta !== null ? trendFromDelta(delta) : null,
      };
    });

    return NextResponse.json({ overallSeries, byDimension });
  } catch (err) {
    return handleApiError(err);
  }
}
