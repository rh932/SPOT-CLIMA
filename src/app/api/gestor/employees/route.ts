export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, inArray, desc, ilike } from 'drizzle-orm';
import {
  requireGestor, requirePermission, handleApiError, ApiError, assertEvaluationSector,
  assertTrainingSector, trainingSectorIds,
} from '@/lib/apiAuth';
import { hasCompleteScope, isInScope, canEvaluate } from '@/lib/scope';
import { hasPermission, permissionsFor } from '@/lib/permissions';
import { trainerEmployeeSchema } from '@/lib/validation';
import { computeDueDates } from '@/lib/probation';
import { secondOpinionFor } from '@/lib/secondOpinion';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Lista de colaboradores do portal da operação, servindo os três papéis.
 *
 * O que vem junto depende da permissão de quem pediu, decidido no servidor:
 * quem não tem `evaluations.view` não recebe as avaliações nem os prazos de
 * ciclo; quem não tem `trainings.view` não recebe os treinamentos. Não é a
 * tela que esconde — o dado nem sai daqui.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.view');
    if (!hasCompleteScope(session)) {
      throw new ApiError(403, 'Sua conta não tem unidade/setor/turno definidos. Contate um administrador.');
    }

    const verAvaliacoes = hasPermission(session.role, 'evaluations.view');
    const verTreinamentos = hasPermission(session.role, 'trainings.view');
    const q = req.nextUrl.searchParams.get('q')?.trim().slice(0, 100);

    // O treinamento é só do Salão (sectors.inTraining). A tela de treinar pede
    // `?treinamento=1`; quem só treina (o Treinador, sem `evaluations.view`)
    // recebe esse recorte sempre — chamar sem o parâmetro não abre os outros
    // setores para ele.
    const recorteTreinamento = req.nextUrl.searchParams.get('treinamento') === '1' || !verAvaliacoes;
    const setores = recorteTreinamento ? await trainingSectorIds(session.scopedSectorIds) : session.scopedSectorIds;
    if (setores.length === 0) {
      return NextResponse.json({ employees: [], canEvaluate: canEvaluate(session.role), permissions: permissionsFor(session.role) });
    }

    const rows = await db.query.probationaryEmployees.findMany({
      where: and(
        inArray(schema.probationaryEmployees.unitId, session.scopedUnitIds),
        inArray(schema.probationaryEmployees.sectorId, setores),
        inArray(schema.probationaryEmployees.shift, session.scopedShifts as ('DIA' | 'NOITE')[]),
        q ? ilike(schema.probationaryEmployees.fullName, `%${q}%`) : undefined,
      ),
      orderBy: desc(schema.probationaryEmployees.createdAt),
      columns: {
        id: true, fullName: true, roleDescription: true, shift: true, admissionDate: true,
        // Ciclo e prazos são da avaliação de experiência: só para quem a enxerga.
        ...(verAvaliacoes
          ? {
            status: true,
            isApprentice: true,
            period1DueDate: true,
            period2DueDate: true,
            currentColor: true,
            nextFeedbackDueDate: true,
            terminationDate: true,
          }
          : {}),
      },
      with: {
        sector: { columns: { id: true, name: true, usesColorCycle: true } },
        unit: { columns: { id: true, name: true } },
        ...(verAvaliacoes
          ? {
            evaluations: {
              columns: { id: true, period: true, cycleNumber: true, evaluationDate: true, color: true, evaluatorAdminId: true, conclusion: true, classification: true, evaluatorName: true },
              // Com mais de um gestor por setor, saber quem avaliou é parte do
              // histórico — não só um detalhe do admin.
              with: { evaluator: { columns: { id: true, name: true } } },
            },
          }
          : {}),
        ...(verTreinamentos
          ? {
            trainings: {
              // `trainingTypeId` e `closure` entram porque a tela de treinar
              // precisa saber quais tipos já foram encerrados em definitivo
              // para aquele colaborador, e bloqueá-los na seleção.
              columns: {
                id: true,
                trainingTypeId: true,
                trainingDate: true,
                result: true,
                needsReinforcement: true,
                closure: true,
              },
              with: { trainingType: { columns: { id: true, name: true } } },
            },
          }
          : {}),
      },
    });

    // Segunda resposta aberta para quem está olhando (setor com dois gestores).
    // A data do desligamento só serve a essa conta e não sai daqui.
    const avalia = canEvaluate(session.role);
    const employees = rows.map((row) => {
      const { terminationDate, ...resto } = row as typeof row & { terminationDate?: Date | null };
      if (!verAvaliacoes) return resto;
      const evs = (row as typeof row & { evaluations?: Parameters<typeof secondOpinionFor>[1] }).evaluations ?? [];
      const segunda = avalia ? secondOpinionFor({ isApprentice: (row as { isApprentice?: boolean }).isApprentice, terminationDate }, evs, session.adminId) : null;
      return { ...resto, secondOpinion: segunda ? { period: segunda.period, until: segunda.until } : null };
    });

    return NextResponse.json({
      employees,
      canEvaluate: canEvaluate(session.role),
      permissions: permissionsFor(session.role),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Cadastro de colaborador pelo portal da operação — hoje é o Treinador quem
 * tem `employees.create`. Só dentro do próprio escopo, validado aqui: mandar
 * ids de outra unidade/setor/turno na mão não passa.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'employees.create');
    if (!hasCompleteScope(session)) {
      throw new ApiError(403, 'Sua conta não tem unidade/setor/turno definidos. Contate um administrador.');
    }

    const body = await req.json().catch(() => null);
    const parsed = trainerEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }

    if (!isInScope(session, parsed.data)) {
      return NextResponse.json(
        { error: 'Você só pode cadastrar dentro da sua unidade, setor e turno.' },
        { status: 403 },
      );
    }
    await assertEvaluationSector(parsed.data.sectorId);
    // O cadastro pelo portal é o do treinamento — só setores do Salão.
    await assertTrainingSector(parsed.data.sectorId);

    // Sem data informada (cadastro do treinador), a admissão é hoje: é o
    // cenário real dele — a pessoa chegou e vai ser treinada agora. Se entrou
    // antes, o RH ajusta no painel e os prazos de 45/90 são recalculados.
    const admissionDate = parsed.data.admissionDate ? new Date(parsed.data.admissionDate) : new Date();
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
        period1DueDate,
        period2DueDate,
        createdById: session.adminId,
      })
      .returning();

    await logAudit({
      adminId: session.adminId,
      action: 'employee.create',
      entityType: 'ProbationaryEmployee',
      entityId: row.id,
      metadata: { origem: 'portal-operacao', papel: session.role },
      req,
    });
    await notifyActivity({ type: 'EMPLOYEE_CREATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
