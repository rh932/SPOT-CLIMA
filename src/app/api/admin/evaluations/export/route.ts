export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { CLASSIFICATION_LABELS, CONCLUSION_LABELS, type Classification, type Conclusion } from '@/lib/experienceReport';
import { COLOR_LABELS, type FeedbackColor } from '@/lib/feedbackCycle';
import { logAudit } from '@/lib/audit';

/** Evita que o Excel leia um texto começando com "=" como fórmula. */
const seguro = (v: string | null | undefined) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v ?? '');
const dia = (d: Date | null) => (d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PERIODO: Record<string, string> = { FIRST: '1ª avaliação (45 dias)', SECOND: '2ª avaliação (90 dias)', FEEDBACK: 'Feedback periódico' };
const NOTA: Record<string, string> = { OTIMO: 'Ótimo', BOM: 'Bom', REGULAR: 'Regular', RUIM: 'Ruim' };
const STATUS: Record<string, string> = {
  AWAITING_PERIOD_1: 'Aguardando 1ª avaliação', AWAITING_PERIOD_2: 'Aguardando 2ª avaliação', HIRED: 'Efetivado', TERMINATED: 'Desligado',
};

/**
 * Excel do histórico de avaliações do painel do RH/ADMIN: uma linha por
 * avaliação (experiência e feedback), com as notas e os textos. Respeita os
 * mesmos filtros da tela (q, unidade, setor, tipo, avaliador).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.history.view');

    const params = req.nextUrl.searchParams;
    const q = norm((params.get('q') ?? '').trim());
    const unidade = params.get('unidade') ?? '';
    const setor = params.get('setor') ?? '';
    const tipo = params.get('tipo') ?? '';
    const avaliador = params.get('avaliador') ?? '';

    const todas = await db.query.performanceEvaluations.findMany({
      orderBy: asc(schema.performanceEvaluations.evaluationDate),
      with: {
        evaluator: { columns: { id: true, name: true } },
        employee: {
          columns: { id: true, fullName: true, roleDescription: true, shift: true, status: true, admissionDate: true },
          with: { sector: { columns: { id: true, name: true } }, unit: { columns: { id: true, name: true } } },
        },
      },
    });

    const linhas = todas.filter((r) => {
      const quem = r.evaluator?.id ?? (r.evaluatorName ? `nome:${r.evaluatorName}` : '');
      return (!q || norm(r.employee?.fullName ?? '').includes(q))
        && (!unidade || r.employee?.unit?.id === unidade)
        && (!setor || r.employee?.sector?.id === setor)
        && (!tipo || r.period === tipo)
        && (!avaliador || quem === avaliador);
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Spot Integra';
    const ws = wb.addWorksheet('Avaliações', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    ws.columns = [
      { header: 'Colaborador', key: 'nome', width: 38 },
      { header: 'Loja', key: 'loja', width: 14 },
      { header: 'Setor', key: 'setor', width: 14 },
      { header: 'Cargo', key: 'cargo', width: 28 },
      { header: 'Turno', key: 'turno', width: 9 },
      { header: 'Admissão', key: 'admissao', width: 12 },
      { header: 'Situação atual', key: 'situacao', width: 22 },
      { header: 'Tipo', key: 'tipo', width: 24 },
      { header: 'Nº', key: 'ciclo', width: 6 },
      { header: 'Data da avaliação', key: 'data', width: 14 },
      { header: 'Avaliador', key: 'avaliador', width: 26 },
      { header: 'Origem', key: 'origem', width: 10 },
      { header: 'Flexibilidade', key: 'flex', width: 13 },
      { header: 'Interesse', key: 'interesse', width: 12 },
      { header: 'Relacionamento', key: 'relac', width: 15 },
      { header: 'Aprendizado', key: 'aprend', width: 13 },
      { header: 'Uniforme', key: 'uniforme', width: 11 },
      { header: 'Classificação', key: 'classif', width: 22 },
      { header: 'Conclusão', key: 'conclusao', width: 12 },
      { header: 'Cor (feedback)', key: 'cor', width: 16 },
      { header: 'Aspectos favoráveis', key: 'fav', width: 50 },
      { header: 'Aspectos desfavoráveis', key: 'desfav', width: 50 },
      { header: 'Pontos de desenvolvimento', key: 'desenv', width: 40 },
      { header: 'Orientação', key: 'orient', width: 40 },
      { header: 'Necessidade de treinamento', key: 'trein', width: 36 },
    ];
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    cab.alignment = { vertical: 'middle', wrapText: true };
    cab.height = 30;

    for (const r of linhas) {
      ws.addRow({
        nome: seguro(r.employee?.fullName ?? 'Colaborador removido'),
        loja: r.employee?.unit?.name ?? '',
        setor: r.employee?.sector?.name ?? '',
        cargo: seguro(r.employee?.roleDescription),
        turno: r.employee ? (r.employee.shift === 'NOITE' ? 'Noite' : 'Dia') : '',
        admissao: dia(r.employee?.admissionDate ?? null),
        situacao: r.employee ? STATUS[r.employee.status] ?? '' : '',
        tipo: PERIODO[r.period] ?? r.period,
        ciclo: r.cycleNumber,
        data: dia(r.evaluationDate),
        avaliador: seguro(r.evaluator?.name ?? r.evaluatorName),
        origem: r.source === 'FORMS' ? 'Forms' : 'Sistema',
        flex: r.flexibilityRating ? NOTA[r.flexibilityRating] : '',
        interesse: r.interestRating ? NOTA[r.interestRating] : '',
        relac: r.relationshipRating ? NOTA[r.relationshipRating] : '',
        aprend: r.learningRating ? NOTA[r.learningRating] : '',
        uniforme: r.uniformRating ? NOTA[r.uniformRating] : '',
        classif: CLASSIFICATION_LABELS[r.classification as Classification] ?? '',
        conclusao: r.conclusion ? CONCLUSION_LABELS[r.conclusion as Conclusion] : '',
        cor: r.color ? COLOR_LABELS[r.color as FeedbackColor] ?? '' : '',
        fav: seguro(r.favorableAspects),
        desfav: seguro(r.unfavorableAspects),
        desenv: seguro(r.developmentPoints),
        orient: seguro(r.guidance),
        trein: seguro(r.trainingNeeds),
      });
    }
    for (const k of ['admissao', 'data']) ws.getColumn(k).numFmt = 'dd/mm/yyyy';
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

    const buffer = await wb.xlsx.writeBuffer();
    await logAudit({
      adminId: session.adminId, action: 'evaluation.export', entityType: 'PerformanceEvaluation',
      metadata: { linhas: linhas.length, filtros: Object.fromEntries(params) }, req,
    });
    const hoje = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="avaliacoes-${hoje}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
