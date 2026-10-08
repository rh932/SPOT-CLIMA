export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import {
  buildReportRow, filtersFromParams, matchesFilters, periodText, sortRows, summarize,
  CLASSIFICATION_LABELS, CLASSIFICATION_SCORE, CONCLUSION_LABELS, SITUATION_LABELS, terminationLabel,
  type ReportEmployeeInput, type SortKey,
} from '@/lib/experienceReport';
import { logAudit } from '@/lib/audit';

const SORT_KEYS: SortKey[] = ['nome', 'admissao', 'prazo', 'loja', 'setor', 'classificacao'];

/** Evita que o Excel leia um nome começando com "=" como fórmula. */
const seguro = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const data = (d: Date | null) => (d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null);

/**
 * Excel da consulta avançada — a mesma lista que está na tela, com os mesmos
 * filtros (lidos da URL e aplicados pela mesma função do navegador).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.view');

    const params = req.nextUrl.searchParams;
    const filtros = filtersFromParams(params);
    const ordem = (SORT_KEYS as string[]).includes(params.get('ordem') ?? '') ? (params.get('ordem') as SortKey) : 'admissao';
    const sentido = params.get('sentido') === 'asc' ? 'asc' : 'desc';

    const employees = await db.query.probationaryEmployees.findMany({
      orderBy: asc(schema.probationaryEmployees.admissionDate),
      with: {
        sector: { columns: { id: true, name: true } },
        unit: { columns: { id: true, name: true } },
        evaluations: {
          columns: {
            id: true, period: true, cycleNumber: true, conclusion: true, classification: true,
            evaluationDate: true, dueDateAtEvaluation: true, source: true, evaluatorName: true,
          },
          with: { evaluator: { columns: { name: true } } },
        },
      },
    });

    const agora = new Date();
    const linhas = sortRows(
      employees.map((e) => buildReportRow(e as ReportEmployeeInput, agora)).filter((r) => matchesFilters(r, filtros)),
      ordem,
      sentido,
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Spot Clima';
    const ws = wb.addWorksheet('Experiência', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    ws.columns = [
      { header: 'Funcionário', key: 'nome', width: 40 },
      { header: 'Loja', key: 'loja', width: 14 },
      { header: 'Setor', key: 'setor', width: 14 },
      { header: 'Cargo', key: 'cargo', width: 28 },
      { header: 'Turno', key: 'turno', width: 9 },
      { header: 'Admissão', key: 'admissao', width: 12 },
      { header: 'Fim 1º contrato', key: 'fim1', width: 14 },
      { header: 'Avaliação 1º período', key: 'aval1', width: 22 },
      { header: 'Data aval. 1º', key: 'data1', width: 13 },
      { header: 'Fim 2º contrato', key: 'fim2', width: 14 },
      { header: 'Avaliação 2º período', key: 'aval2', width: 22 },
      { header: 'Data aval. 2º', key: 'data2', width: 13 },
      { header: 'Classif. (1-4)', key: 'classifNum', width: 12 },
      { header: 'Classificação', key: 'classif', width: 22 },
      { header: 'Conclusão', key: 'conclusao', width: 12 },
      { header: 'Situação', key: 'situacao', width: 20 },
      { header: 'Avaliadores', key: 'avaliadores', width: 40 },
      { header: 'Motivo do desligamento', key: 'motivo', width: 28 },
      { header: 'Data de saída', key: 'saida', width: 13 },
    ];
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    cab.alignment = { vertical: 'middle', wrapText: true };
    cab.height = 30;

    for (const r of linhas) {
      ws.addRow({
        nome: seguro(r.fullName),
        loja: r.unit,
        setor: r.sector,
        cargo: seguro(r.role),
        turno: r.shift === 'NOITE' ? 'Noite' : 'Dia',
        admissao: data(r.admission),
        fim1: r.isApprentice ? null : data(r.period1.due),
        aval1: periodText(r.period1),
        data1: data(r.period1.evaluations[0]?.date ?? null),
        fim2: r.isApprentice ? null : data(r.period2.due),
        aval2: periodText(r.period2),
        data2: data(r.period2.evaluations[0]?.date ?? null),
        classifNum: r.lastClassification ? CLASSIFICATION_SCORE[r.lastClassification] : null,
        classif: r.lastClassification ? CLASSIFICATION_LABELS[r.lastClassification] : '',
        conclusao: r.lastConclusion ? CONCLUSION_LABELS[r.lastConclusion] : '',
        situacao: SITUATION_LABELS[r.situation],
        avaliadores: seguro(r.evaluators.join(', ')),
        motivo: terminationLabel(r.terminationReason),
        saida: data(r.terminationDate),
      });
    }
    for (const k of ['admissao', 'fim1', 'data1', 'fim2', 'data2', 'saida']) ws.getColumn(k).numFmt = 'dd/mm/yyyy';
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

    // Totais, como o rodapé da planilha antiga ("TOTAL ADMITIDOS / LOJA").
    const resumo = summarize(linhas);
    const wr = wb.addWorksheet('Resumo');
    wr.columns = [{ header: 'Indicador', key: 'k', width: 36 }, { header: 'Valor', key: 'v', width: 14 }];
    wr.getRow(1).font = { bold: true };
    wr.addRow({ k: 'Total na consulta', v: resumo.total });
    for (const [s, n] of Object.entries(resumo.bySituation)) wr.addRow({ k: SITUATION_LABELS[s as keyof typeof SITUATION_LABELS], v: n });
    wr.addRow({ k: 'Avaliações entregues', v: resumo.delivered });
    wr.addRow({ k: 'Entregues no prazo', v: resumo.deliveredOnTime });
    wr.addRow({ k: 'Avaliações atrasadas (sem resposta)', v: resumo.overdue });
    if (resumo.hireRate !== null) wr.addRow({ k: 'Taxa de efetivação', v: `${Math.round(resumo.hireRate * 100)}%` });
    wr.addRow({});
    wr.addRow({ k: 'Por loja' }).font = { bold: true };
    for (const u of resumo.byUnit) wr.addRow({ k: u.name, v: u.count });
    wr.addRow({});
    wr.addRow({ k: 'Por setor' }).font = { bold: true };
    for (const s of resumo.bySector) wr.addRow({ k: s.name, v: s.count });

    const buffer = await wb.xlsx.writeBuffer();
    await logAudit({
      adminId: session.adminId, action: 'employee.export', entityType: 'ProbationaryEmployee',
      metadata: { linhas: linhas.length, filtros: Object.fromEntries(params) }, req,
    });
    const hoje = agora.toISOString().slice(0, 10);
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="experiencia-${hoje}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
