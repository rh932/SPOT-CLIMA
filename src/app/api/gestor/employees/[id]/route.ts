export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, asc, desc } from 'drizzle-orm';
import { requireGestor, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { hasPermission } from '@/lib/permissions';
import { isInScope, canEvaluate } from '@/lib/scope';
import { secondOpinionFor } from '@/lib/secondOpinion';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.view');
    const employee = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, params.id),
      with: { sector: true, unit: true },
    });
    if (!employee) throw new ApiError(404, 'Funcionário não encontrado.');
    if (!isInScope(session, employee)) {
      throw new ApiError(403, 'Este funcionário não está no seu escopo.');
    }

    // A ficha do colaborador junta tudo que aconteceu com ele: avaliações,
    // mudanças de cor e treinamentos. Cada bloco só vem se quem está olhando
    // pode vê-lo — o Treinador, por exemplo, não enxerga avaliação.
    const podeVerAvaliacoes = hasPermission(session.role, 'evaluations.view');
    const podeVerTreinamentos = hasPermission(session.role, 'trainings.view');
    // Quem só treina não abre ficha de colaborador fora do Salão, nem pelo id
    // direto na URL: o treinamento é só dos setores com sectors.inTraining.
    if (!podeVerAvaliacoes && !employee.sector.inTraining) {
      throw new ApiError(403, 'Este colaborador não é de um setor do treinamento.');
    }

    const [evaluations, colorChanges, trainings] = await Promise.all([
      podeVerAvaliacoes
        ? db.query.performanceEvaluations.findMany({
          where: eq(schema.performanceEvaluations.employeeId, params.id),
          orderBy: asc(schema.performanceEvaluations.evaluationDate),
          with: { evaluator: { columns: { id: true, name: true } } },
        })
        : Promise.resolve([]),
      podeVerAvaliacoes
        ? db.query.employeeColorChanges.findMany({
          where: eq(schema.employeeColorChanges.employeeId, params.id),
          orderBy: desc(schema.employeeColorChanges.createdAt),
          with: { changedBy: { columns: { id: true, name: true } } },
        })
        : Promise.resolve([]),
      podeVerTreinamentos
        ? db.query.trainings.findMany({
          where: eq(schema.trainings.employeeId, params.id),
          orderBy: desc(schema.trainings.trainingDate),
          with: {
            trainingType: { columns: { id: true, name: true } },
            trainer: { columns: { id: true, name: true } },
          },
        })
        : Promise.resolve([]),
    ]);

    // Motivo e texto do desligamento são dado de RH, da mesma família da
    // avaliação: quem não vê avaliação (o Treinador) também não vê isso.
    // A situação anterior é controle interno do "desfazer" do RH.
    const { previousStatus: _interno, terminationReason, terminationDate, terminationNotes, ...cadastro } = employee;
    void _interno;
    // Quem não vê avaliação (o Treinador) recebe o mesmo recorte da lista
    // (GET /api/gestor/employees): sem situação, cor, prazos de 45/90 nem quem
    // cadastrou — antes o detalhe entregava tudo o que a lista escondia.
    const employeeOut = podeVerAvaliacoes
      ? { ...cadastro, terminationReason, terminationDate, terminationNotes }
      : {
        id: employee.id,
        fullName: employee.fullName,
        roleDescription: employee.roleDescription,
        shift: employee.shift,
        admissionDate: employee.admissionDate,
        sectorId: employee.sectorId,
        unitId: employee.unitId,
        sector: { id: employee.sector.id, name: employee.sector.name, usesColorCycle: employee.sector.usesColorCycle },
        unit: { id: employee.unit.id, name: employee.unit.name },
      };

    // Setor com dois gestores: se outro gestor já respondeu o período, este
    // ainda pode dar a segunda resposta (mesma regra que a rota de avaliação aplica).
    const segunda = podeVerAvaliacoes && canEvaluate(session.role)
      ? secondOpinionFor(employee, evaluations, session.adminId)
      : null;
    const primeiraAvaliacao = segunda
      ? evaluations.find((e) => e.period === segunda.period && new Date(e.evaluationDate).getTime() === new Date(segunda.first.evaluationDate).getTime())
      : null;

    return NextResponse.json({
      employee: employeeOut,
      secondOpinion: segunda
        ? {
          period: segunda.period,
          until: segunda.until,
          firstEvaluator: primeiraAvaliacao?.evaluator?.name ?? primeiraAvaliacao?.evaluatorName ?? null,
          firstConclusion: segunda.first.conclusion,
          firstDate: segunda.first.evaluationDate,
        }
        : null,
      evaluations,
      colorChanges,
      trainings,
      canEvaluate: canEvaluate(session.role),
      canChangeColor: hasPermission(session.role, 'employees.color.edit'),
      canDelete: hasPermission(session.role, 'employees.delete'),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Excluir colaborador — no portal do gestor, só o GESTOR_LIDER tem a permissão
 * `employees.delete`. O Gestor comum recebe 403 mesmo chamando a API direto, e
 * o escopo continua valendo: ninguém exclui alguém de fora do seu recorte.
 *
 * Histórico não some por acidente: com vínculos, a primeira chamada devolve
 * 409 com a contagem; só com `?confirm=true` a exclusão acontece (as tabelas
 * filhas caem por cascade).
 */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.delete');

    const employee = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, params.id),
      columns: { id: true, fullName: true, unitId: true, sectorId: true, shift: true },
    });
    if (!employee) throw new ApiError(404, 'Funcionário não encontrado.');
    if (!isInScope(session, employee)) {
      throw new ApiError(403, 'Este funcionário não está no seu escopo.');
    }

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
      metadata: { fullName: employee.fullName, evaluations: evaluations.length, trainings: trainingsDone.length, origem: 'gestor-lider' },
      req,
    });
    await notifyActivity({ type: 'EMPLOYEE_REMOVED', employee }, session.adminId);
    return NextResponse.json({ ok: true, deleted: { evaluations: evaluations.length, trainings: trainingsDone.length } });
  } catch (err) {
    return handleApiError(err);
  }
}
