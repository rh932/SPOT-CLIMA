export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSurveyResults, getCommentAnalysis } from '@/lib/results';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { buildCsv, buildXlsx } from '@/lib/exportReport';
import { renderUrlToPdf } from '@/lib/pdf';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'reports.view');
    const format = req.nextUrl.searchParams.get('format') ?? 'csv';
    if (format !== 'csv' && format !== 'xlsx' && format !== 'pdf') {
      throw new ApiError(400, 'Formato inválido. Use csv, xlsx ou pdf.');
    }
    const results = await getSurveyResults(params.id);
    if (!results) throw new ApiError(404, 'Pesquisa não encontrada.');
    // Arquivo exportado sai do sistema e não tem como ser "travado" depois:
    // com resultados indisponíveis (pesquisa aberta ou abaixo do limite), não
    // há o que exportar.
    if (results.locked) throw new ApiError(409, results.lockedReason ?? 'Resultados indisponíveis.');

    await logAudit({
      adminId: session.adminId,
      action: 'report.export',
      entityType: 'Survey',
      entityId: params.id,
      metadata: { format },
      req,
    });

    if (format === 'csv') {
      const csv = buildCsv(results);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="spot-clima-${params.id}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const comments = await getCommentAnalysis(params.id);
      if (!comments) throw new ApiError(404, 'Pesquisa não encontrada.');
      const buffer = await buildXlsx(results, comments);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="spot-clima-${params.id}.xlsx"`,
        },
      });
    }

    if (format === 'pdf') {
      if (!/^[\w-]{1,64}$/.test(params.id)) throw new ApiError(400, 'Identificador inválido.');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const printUrl = `${appUrl}/admin/reports/${params.id}/print`;
      const cookieHeader = req.headers.get('cookie') ?? undefined;
      try {
        const pdf = await renderUrlToPdf(printUrl, cookieHeader);
        return new NextResponse(pdf, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="spot-clima-${params.id}.pdf"`,
          },
        });
      } catch (err) {
        // Em ambientes serverless (ex.: Vercel) o Chromium headless usado aqui
        // normalmente não está disponível. Em vez de derrubar a rota com um
        // erro 500 genérico, orientamos o RH a usar as alternativas que não
        // dependem de Chromium no servidor.
        console.error('Falha ao gerar PDF via Chromium headless:', err);
        throw new ApiError(
          503,
          'Geração automática de PDF indisponível neste ambiente de hospedagem. Use "Excel" ou "CSV" acima, ou abra o relatório e use Imprimir > Salvar como PDF no navegador.'
        );
      }
    }

    throw new ApiError(400, 'Formato inválido. Use csv, xlsx ou pdf.');
  } catch (err) {
    return handleApiError(err);
  }
}
