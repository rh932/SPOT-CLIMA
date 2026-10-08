export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, assertEvaluationSector } from '@/lib/apiAuth';
import { probationaryEmployeeSchema } from '@/lib/validation';
import { computeDueDates } from '@/lib/probation';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.view');
    const rows = await db.query.probationaryEmployees.findMany({
      orderBy: desc(schema.probationaryEmployees.createdAt),
      with: {
        sector: true,
        unit: true,
        // O suficiente para a consulta avançada montar o quadro de admissões
        // (prazo, entrega, classificação, conclusão e avaliador) sem uma
        // chamada por funcionário. Textos livres e sub-respostas ficam no detalhe.
        evaluations: {
          columns: {
            id: true, period: true, cycleNumber: true, conclusion: true, classification: true,
            evaluationDate: true, dueDateAtEvaluation: true, source: true, evaluatorName: true,
            flexibilityRating: true, interestRating: true, relationshipRating: true, learningRating: true,
          },
          with: { evaluator: { columns: { name: true } } },
        },
      },
    });
    return NextResponse.json({ employees: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.create');
    const body = await req.json().catch(() => null);
    const parsed = probationaryEmployeeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    await assertEvaluationSector(parsed.data.sectorId);

    const admissionDate = new Date(parsed.data.admissionDate);
    const { period1DueDate, period2DueDate } = computeDueDates(admissionDate);

    const [row] = await db
      .insert(schema.probationaryEmployees)
      .values({
        fullName: parsed.data.fullName,
        admissionDate,
        roleDescription: parsed.data.roleDescription,
        sectorId: parsed.data.sectorId,
        unitId: parsed.data.unitId,
        shift: parsed.data.shift,
        // Aprendiz não entra na fila de 45/90: fica em contrato desde o cadastro.
        isApprentice: parsed.data.isApprentice ?? false,
        ...(parsed.data.isApprentice ? { status: 'HIRED' as const } : {}),
        period1DueDate,
        period2DueDate,
        createdById: session.adminId,
      })
      .returning();

    await logAudit({ adminId: session.adminId, action: 'employee.create', entityType: 'ProbationaryEmployee', entityId: row.id, req });
    await notifyActivity({ type: 'EMPLOYEE_CREATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
