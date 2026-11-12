export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, assertEvaluationSector } from '@/lib/apiAuth';
import { probationaryEmployeeSchema } from '@/lib/validation';
import { cycleFieldsFor, findDuplicate } from '@/lib/employeeCreate';
import { withFeedbackCycle } from '@/lib/feedbackParticipation';
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
    return NextResponse.json({ employees: rows.map((r) => withFeedbackCycle(r)) });
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
    const track = parsed.data.track ?? 'NOVO';

    // Cadastro único: homônimo na mesma unidade só entra com confirmação explícita.
    if (!parsed.data.allowDuplicate) {
      const mesmaUnidade = await db.query.probationaryEmployees.findMany({
        where: eq(schema.probationaryEmployees.unitId, parsed.data.unitId),
        columns: { id: true, fullName: true, unitId: true },
      });
      if (findDuplicate(mesmaUnidade, parsed.data)) {
        return NextResponse.json(
          { error: 'Já existe um colaborador com este nome nesta unidade. Confirme se é outra pessoa para cadastrar mesmo assim.', duplicate: true },
          { status: 409 },
        );
      }
    }

    const [row] = await db
      .insert(schema.probationaryEmployees)
      .values({
        fullName: parsed.data.fullName,
        admissionDate,
        roleDescription: parsed.data.roleDescription,
        sectorId: parsed.data.sectorId,
        unitId: parsed.data.unitId,
        shift: parsed.data.shift,
        // Aprendiz e colaborador ativo não entram na fila de 45/90.
        ...cycleFieldsFor(track, admissionDate, parsed.data.isApprentice ?? false),
        createdById: session.adminId,
      })
      .returning();

    await logAudit({ adminId: session.adminId, action: 'employee.create', entityType: 'ProbationaryEmployee', entityId: row.id, metadata: { trilha: track }, req });
    await notifyActivity({ type: 'EMPLOYEE_CREATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
