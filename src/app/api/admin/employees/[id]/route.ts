export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError, assertEvaluationSector } from '@/lib/apiAuth';
import { probationaryEmployeeSchema } from '@/lib/validation';
import { computeDueDates } from '@/lib/probation';
import { statusFromEvaluations } from '@/lib/termination';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.view');
    const employee = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, params.id),
      with: { sector: true, unit: true },
    });
    if (!employee) throw new ApiError(404, 'Funcionário não encontrado.');

    const evaluations = await db.query.performanceEvaluations.findMany({
      where: eq(schema.performanceEvaluations.employeeId, params.id),
      orderBy: asc(schema.performanceEvaluations.evaluationDate),
      with: { evaluator: { columns: { id: true, name: true } } },
    });

    return NextResponse.json({ employee, evaluations });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.edit');
    const body = await req.json().catch(() => null);
    const parsed = probationaryEmployeeSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const { admissionDate, ...rest } = parsed.data;
    if (rest.sectorId) await assertEvaluationSector(rest.sectorId);

    // Mudar a admissão move os dois prazos junto — senão a tela mostra uma
    // data de admissão e um vencimento calculado a partir de outra.
    let dueDates = {};
    if (admissionDate) {
      const existing = await db.query.probationaryEmployees.findFirst({
        where: eq(schema.probationaryEmployees.id, params.id),
        with: { evaluations: { columns: { id: true } } },
      });
      if (!existing) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });
      if (existing.evaluations.length > 0) {
        return NextResponse.json(
          { error: 'Este funcionário já tem avaliação registrada — a data de admissão não pode mais ser alterada.' },
          { status: 409 },
        );
      }
      dueDates = computeDueDates(new Date(admissionDate));
    }

    // Marcar ou desmarcar aprendiz muda a situação: aprendiz não aguarda
    // ciclo de experiência, e quem deixa de ser aprendiz volta para a
    // situação de antes da marcação. Desligado continua desligado.
    let statusChange = {};
    if (rest.isApprentice !== undefined) {
      const atual = await db.query.probationaryEmployees.findFirst({
        where: eq(schema.probationaryEmployees.id, params.id),
        columns: { status: true, isApprentice: true, previousStatus: true },
        with: { evaluations: { columns: { period: true, conclusion: true, evaluationDate: true } } },
      });
      if (!atual) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });
      if (atual.status !== 'TERMINATED' && atual.isApprentice !== rest.isApprentice) {
        statusChange = rest.isApprentice
          ? {
            // Guarda a situação para o "desmarcar" voltar a ela, e tira do
            // ciclo de cores: aprendiz não tem feedback por cor.
            status: 'HIRED' as const,
            previousStatus: atual.status,
            currentColor: null,
            nextFeedbackDueDate: null,
          }
          : {
            // Recalcular pelas avaliações rebaixaria quem foi efetivado sem
            // avaliação registrada; a situação guardada vence.
            status: atual.previousStatus ?? statusFromEvaluations(atual.evaluations, false),
            previousStatus: null,
          };
      }
    }

    const [row] = await db
      .update(schema.probationaryEmployees)
      .set({
        ...rest,
        ...(admissionDate ? { admissionDate: new Date(admissionDate) } : {}),
        ...dueDates,
        ...statusChange,
        updatedAt: new Date(),
      })
      .where(eq(schema.probationaryEmployees.id, params.id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'employee.update', entityType: 'ProbationaryEmployee', entityId: row.id, req });
    await notifyActivity({ type: 'EMPLOYEE_UPDATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Excluir funcionário — exclusivo do ADMIN (SUPER_ADMIN/RH), validado aqui e
 * não só na interface. Gestor, Gestor Líder e Treinador não têm a permissão
 * `employees.delete` e recebem 403 mesmo chamando a API direto.
 *
 * Histórico não é apagado por acidente: se houver avaliações ou treinamentos
 * vinculados, a primeira chamada devolve 409 com a contagem, para a tela
 * explicar exatamente o que será perdido. Só com `?confirm=true` a exclusão
 * acontece — e aí as tabelas filhas caem por cascade (FK onDelete cascade),
 * sem deixar registro órfão.
 */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.delete');

    const employee = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, params.id),
      // Unidade, setor e turno: é por eles que se sabe quem avisar da exclusão.
      columns: { id: true, fullName: true, unitId: true, sectorId: true, shift: true },
    });
    if (!employee) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });

    const [evaluations, trainingsDone] = await Promise.all([
      db.query.performanceEvaluations.findMany({
        where: eq(schema.performanceEvaluations.employeeId, params.id),
        columns: { id: true },
      }),
      db.query.trainings.findMany({
        where: eq(schema.trainings.employeeId, params.id),
        columns: { id: true },
      }),
    ]);

    const confirmed = req.nextUrl.searchParams.get('confirm') === 'true';
    if (!confirmed && (evaluations.length > 0 || trainingsDone.length > 0)) {
      return NextResponse.json(
        {
          error: 'Este funcionário possui registros vinculados.',
          related: { evaluations: evaluations.length, trainings: trainingsDone.length },
          requiresConfirmation: true,
        },
        { status: 409 },
      );
    }

    await db.delete(schema.probationaryEmployees).where(eq(schema.probationaryEmployees.id, params.id));

    await logAudit({
      adminId: session.adminId,
      action: 'employee.delete',
      entityType: 'ProbationaryEmployee',
      entityId: params.id,
      metadata: { fullName: employee.fullName, evaluations: evaluations.length, trainings: trainingsDone.length },
      req,
    });
    await notifyActivity({ type: 'EMPLOYEE_REMOVED', employee }, session.adminId);
    return NextResponse.json({ ok: true, deleted: { evaluations: evaluations.length, trainings: trainingsDone.length } });
  } catch (err) {
    return handleApiError(err);
  }
}
