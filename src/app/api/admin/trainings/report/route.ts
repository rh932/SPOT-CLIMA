export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { buildTrainingReport, buildTrainingsCsv, type TrainingRecordInput } from '@/lib/trainingReport';
import { logAudit } from '@/lib/audit';

/**
 * Relatório de treinamentos.
 *
 * Sem `?format`, devolve os números agregados para a tela. Com `format=csv`,
 * devolve o arquivo com uma linha por treinamento.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'reports.view');

    const typeId = req.nextUrl.searchParams.get('typeId');
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    const format = req.nextUrl.searchParams.get('format');
    // Data inválida virava `new Date('lixo')` e derrubava a consulta com 500.
    const dia = /^\d{4}-\d{2}-\d{2}$/;
    if ((from && !dia.test(from)) || (to && !dia.test(to)) || (typeId && typeId.length > 64)) {
      throw new ApiError(400, 'Filtro inválido.');
    }

    const rows = await db.query.trainings.findMany({
      where: and(
        typeId ? eq(schema.trainings.trainingTypeId, typeId) : undefined,
        from ? gte(schema.trainings.trainingDate, new Date(from)) : undefined,
        // O "até" inclui o dia inteiro: sem isso, filtrar 01/10 a 01/10 não
        // traria nada, porque a data gravada tem hora.
        to ? lte(schema.trainings.trainingDate, new Date(`${to}T23:59:59.999Z`)) : undefined,
      ),
      orderBy: desc(schema.trainings.trainingDate),
      with: {
        employee: { columns: { id: true, fullName: true } },
        trainingType: { columns: { id: true, name: true } },
        trainer: { columns: { id: true, name: true } },
        answers: { with: { criterion: { columns: { id: true, label: true } } } },
      },
    });

    const records = rows as unknown as TrainingRecordInput[];

    if (format === 'csv') {
      await logAudit({ adminId: session.adminId, action: 'report.export', entityType: 'Training', req });
      // BOM para o Excel abrir os acentos corretamente.
      return new NextResponse(`﻿${buildTrainingsCsv(records)}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="treinamentos.csv"',
        },
      });
    }

    return NextResponse.json({ report: buildTrainingReport(records) });
  } catch (err) {
    return handleApiError(err);
  }
}
