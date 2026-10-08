export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { requireGestor, requirePermission, handleApiError, assertTrainingSector, trainingSectorIds } from '@/lib/apiAuth';
import { hasPermission } from '@/lib/permissions';
import { hasCompleteScope, isInScope } from '@/lib/scope';
import { trainingSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';
// Lê o SQLSTATE também dentro do embrulho DrizzleQueryError (Drizzle 0.44+).
import { isUniqueViolation } from '@/lib/dbErrors';

/**
 * Histórico de treinamentos.
 *
 * Quem SUPERVISIONA (Gestor Líder, Super Admin — os que podem reabrir um
 * encerramento) vê os treinamentos da equipe dentro do escopo, que é o ponto
 * de ter acesso a treinamento: cobrar o que está pendente. Quem apenas treina
 * (o Treinador) vê os que ele mesmo registrou.
 *
 * A ordem dos testes importa: o Super Admin tem TODAS as permissões, inclusive
 * `trainings.create`. Checar "registra" primeiro faria a tela dele listar só
 * os treinamentos que ele próprio aplicou — ou seja, nenhum.
 */
export async function GET() {
  try {
    const session = await requireGestor();
    requirePermission(session, 'trainings.history.view');

    const supervisiona = hasPermission(session.role, 'trainings.reopen');
    const registraTreinamento = !supervisiona && hasPermission(session.role, 'trainings.create');

    // Só o Salão (sectors.inTraining) e só o escopo atual de quem pede —
    // inclusive para o Treinador: se o ADMIN trocar o setor dele, os
    // treinamentos do setor antigo deixam de aparecer para ele.
    const setoresTreino = await trainingSectorIds(session.scopedSectorIds);
    const escopo = hasCompleteScope(session) && setoresTreino.length > 0
      ? await db.query.probationaryEmployees.findMany({
        where: and(
          inArray(schema.probationaryEmployees.unitId, session.scopedUnitIds),
          inArray(schema.probationaryEmployees.sectorId, setoresTreino),
          inArray(schema.probationaryEmployees.shift, session.scopedShifts as ('DIA' | 'NOITE')[]),
        ),
        columns: { id: true },
      })
      : [];
    const idsNoEscopo = escopo.map((e) => e.id);

    // Sem ninguém no escopo, não há histórico a mostrar — e um inArray vazio
    // no Drizzle traria a tabela inteira.
    if (idsNoEscopo.length === 0) {
      return NextResponse.json({ trainings: [] });
    }

    const rows = await db.query.trainings.findMany({
      where: registraTreinamento
        ? and(eq(schema.trainings.trainerAdminId, session.adminId), inArray(schema.trainings.employeeId, idsNoEscopo))
        : inArray(schema.trainings.employeeId, idsNoEscopo),
      orderBy: desc(schema.trainings.trainingDate),
      limit: 200,
      with: {
        employee: { columns: { id: true, fullName: true, roleDescription: true } },
        trainingType: { columns: { id: true, name: true, positiveLabel: true, negativeLabel: true } },
        trainer: { columns: { id: true, name: true } },
        reopenedBy: { columns: { id: true, name: true } },
        answers: { with: { criterion: { columns: { id: true, label: true, hint: true, order: true } } } },
      },
    });

    return NextResponse.json({ trainings: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Finaliza um treinamento: valida, registra data/treinador e vincula ao colaborador. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'trainings.create');

    const body = await req.json().catch(() => null);
    const parsed = trainingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }

    // Colaborador e tipo precisam existir — evita gravar treinamento apontando
    // para id inventado por quem chamou a API direto.
    const [employee, trainingType] = await Promise.all([
      db.query.probationaryEmployees.findFirst({
        where: eq(schema.probationaryEmployees.id, parsed.data.employeeId),
        columns: { id: true, fullName: true, unitId: true, sectorId: true, shift: true },
      }),
      db.query.trainingTypes.findFirst({
        where: eq(schema.trainingTypes.id, parsed.data.trainingTypeId),
        columns: { id: true, name: true, active: true },
        with: { criteria: { columns: { id: true, label: true, active: true } } },
      }),
    ]);
    if (!employee) return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 });
    // Ninguém treina fora do próprio recorte, mesmo mandando o id na mão.
    if (!isInScope(session, employee)) {
      return NextResponse.json({ error: 'Este colaborador não está no seu escopo.' }, { status: 403 });
    }
    // O treinamento é só do Salão: ficha para colaborador de outro setor não entra.
    await assertTrainingSector(employee.sectorId);
    if (!trainingType || !trainingType.active) {
      return NextResponse.json({ error: 'Tipo de treinamento indisponível.' }, { status: 404 });
    }

    // Todo critério ativo do formulário precisa de nota, e nota só pode vir
    // para critério que pertence a este formulário — validado aqui, não só na
    // tela.
    const ativos = trainingType.criteria.filter((c) => c.active);
    const validIds = new Set(ativos.map((c) => c.id));
    const respondidos = Object.keys(parsed.data.answers);

    const invalido = respondidos.find((id) => !validIds.has(id));
    if (invalido) {
      return NextResponse.json({ error: 'Resposta enviada para um critério que não é deste formulário.' }, { status: 400 });
    }
    const faltando = ativos.filter((c) => !parsed.data.answers[c.id]);
    if (faltando.length > 0) {
      return NextResponse.json(
        { error: `Avalie todos os itens. Faltou: ${faltando.map((c) => c.label).join(', ')}.` },
        { status: 400 },
      );
    }

    // Treinamento encerrado em definitivo não recebe ficha nova — nem do dia,
    // nem outra definitiva. A checagem aqui é para dar uma resposta legível;
    // quem garante de fato, contra dois treinadores clicando ao mesmo tempo, é
    // o índice único parcial em `trainings` (ver schema).
    const jaEncerrado = await db.query.trainings.findFirst({
      where: and(
        eq(schema.trainings.employeeId, parsed.data.employeeId),
        eq(schema.trainings.trainingTypeId, parsed.data.trainingTypeId),
        eq(schema.trainings.closure, 'DEFINITIVO'),
      ),
      columns: { id: true, trainingDate: true },
      with: { trainer: { columns: { name: true } } },
    });
    if (jaEncerrado) {
      return NextResponse.json(
        {
          error: `O treinamento "${trainingType.name}" de ${employee.fullName} foi encerrado em definitivo por ${jaEncerrado.trainer?.name ?? 'outro treinador'} em ${jaEncerrado.trainingDate.toLocaleDateString('pt-BR')}. Peça ao RH ou ao Gestor Líder para reabrir.`,
          alreadyClosed: true,
          closedBy: jaEncerrado.trainer?.name ?? null,
          closedAt: jaEncerrado.trainingDate,
        },
        { status: 409 },
      );
    }

    // O índice único parcial só deixa existir UM encerramento definitivo por
    // colaborador + tipo. Se dois treinadores fecharem no mesmo instante, um
    // deles cai aqui — e recebe a mesma explicação do caminho checado acima,
    // em vez de um erro de banco.
    const row = await db
      .transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.trainings)
          .values({
            employeeId: parsed.data.employeeId,
            trainingTypeId: parsed.data.trainingTypeId,
            trainerAdminId: session.adminId,
            trainingDate: new Date(),
            result: parsed.data.result,
            needsReinforcement: parsed.data.needsReinforcement,
            reinforcementNotes: parsed.data.reinforcementNotes ?? null,
            positivePoints: parsed.data.positivePoints ?? null,
            negativePoints: parsed.data.negativePoints ?? null,
            observations: parsed.data.observations ?? null,
            employeeFeedback: parsed.data.employeeFeedback ?? null,
            contextValues: parsed.data.contextValues ?? null,
            closure: parsed.data.closure,
          })
          .returning();

        const answerRows = Object.entries(parsed.data.answers)
          .map(([criterionId, rating]) => ({ trainingId: created.id, criterionId, rating }));
        if (answerRows.length > 0) await tx.insert(schema.trainingAnswers).values(answerRows);

        return created;
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err)) return null;
        throw err;
      });

    if (!row) {
      return NextResponse.json(
        {
          error: `O treinamento "${trainingType.name}" de ${employee.fullName} acabou de ser encerrado em definitivo por outro treinador. Peça ao RH ou ao Gestor Líder para reabrir.`,
          alreadyClosed: true,
        },
        { status: 409 },
      );
    }

    await logAudit({
      adminId: session.adminId,
      action: 'training.create',
      entityType: 'Training',
      entityId: row.id,
      metadata: {
        employeeId: employee.id,
        trainingType: trainingType.name,
        result: parsed.data.result,
        closure: parsed.data.closure,
      },
      req,
    });

    await notifyActivity({
      type: 'TRAINING_CREATED',
      employee,
      trainingType: trainingType.name,
      definitivo: parsed.data.closure === 'DEFINITIVO',
    }, session.adminId);

    return NextResponse.json({ training: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
