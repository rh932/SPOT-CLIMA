export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { asc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { buildReportRow, type ReportEmployeeInput } from '@/lib/experienceReport';
import { computeIndicators, daysUntil, type IndicatorDueItem } from '@/lib/indicators';
import { saoPauloDay } from '@/lib/probation';

/**
 * Indicadores da avaliação de experiência (src/lib/indicators.ts): evolução
 * mês a mês, loja/setor e a pontualidade de cada gestor.
 */
export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.view');

    const [employees, evaluations, gestores] = await Promise.all([
      db.query.probationaryEmployees.findMany({
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
      }),
      db.query.performanceEvaluations.findMany({
        columns: { evaluatorAdminId: true, period: true, evaluationDate: true, dueDateAtEvaluation: true },
      }),
      db.query.admins.findMany({
        where: inArray(schema.admins.role, ['GESTOR', 'GERENTE', 'GESTOR_LIDER']),
        columns: { id: true, name: true, role: true, active: true },
        with: {
          scopedUnits: { columns: { unitId: true } },
          scopedSectors: { columns: { sectorId: true } },
          scopedShifts: { columns: { shift: true } },
        },
      }),
    ]);

    const agora = new Date();
    const hoje = saoPauloDay(agora);
    const rows = employees.map((e) => buildReportRow(e as ReportEmployeeInput, agora));

    // Prazos em aberto hoje: experiência (pendente/atrasada) e feedback do ciclo de cores.
    const openDues: IndicatorDueItem[] = [];
    for (const e of employees) {
      const row = rows.find((r) => r.id === e.id)!;
      if (row.openDue) openDues.push({ unitId: e.unitId, sectorId: e.sectorId, shift: e.shift, days: row.openDue.days });
      if (e.status === 'HIRED' && e.nextFeedbackDueDate) {
        openDues.push({ unitId: e.unitId, sectorId: e.sectorId, shift: e.shift, days: daysUntil(e.nextFeedbackDueDate, hoje) });
      }
    }

    const result = computeIndicators({
      rows,
      evaluations,
      managers: gestores
        .filter((g) => g.active)
        .map((g) => ({
          id: g.id,
          name: g.name,
          role: g.role,
          scope: {
            scopedUnitIds: g.scopedUnits.map((u) => u.unitId),
            scopedSectorIds: g.scopedSectors.map((s) => s.sectorId),
            scopedShifts: g.scopedShifts.map((s) => s.shift),
          },
        })),
      openDues,
      now: agora,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

