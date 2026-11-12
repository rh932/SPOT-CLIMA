export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, inArray, desc, ilike, eq } from 'drizzle-orm';
import {
  requireGestor, requirePermission, handleApiError, ApiError, assertEvaluationSector,
  assertTrainingSector, trainingSectorIds,
} from '@/lib/apiAuth';
import { hasCompleteScope, isInScope, canEvaluate } from '@/lib/scope';
import { hasPermission, permissionsFor } from '@/lib/permissions';
import { trainerEmployeeSchema } from '@/lib/validation';
import { cycleFieldsFor, findDuplicate } from '@/lib/employeeCreate';
import { secondOpinionFor } from '@/lib/secondOpinion';
import { withFeedbackCycle, sectorDoesFeedback } from '@/lib/feedbackParticipation';
import { logAudit } from '@/lib/audit';
import { notifyActivity, loadNotifiableAdmins } from '@/lib/notify';
import { shouldNotify } from '@/lib/notificationTargets';

/** Campos de ciclo que não saem para quem não avalia (ver a consulta abaixo). */
const CAMPOS_DE_CICLO = ['status', 'track', 'isApprentice', 'period1DueDate', 'period2DueDate', 'currentColor', 'nextFeedbackDueDate'];

function semCamposDeCiclo(campos: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(campos).filter(([k]) => !CAMPOS_DE_CICLO.includes(k)));
}

/** Fim do contrato de experiência em aberto (ISO), ou null. Aprendiz e efetivado não têm. */
function prazoDaExperiencia(campos: Record<string, unknown>): string | null {
  if (campos.isApprentice) return null;
  if (campos.status === 'AWAITING_PERIOD_1') return (campos.period1DueDate as Date).toISOString();
  if (campos.status === 'AWAITING_PERIOD_2') return (campos.period2DueDate as Date).toISOString();
  return null;
}

/** Perfis de gerente: quem foi cadastrado por eles fica de fora das "últimas admissões" da aba Treinar. */
const PAPEIS_DE_GERENTE = ['GERENTE', 'GERENTE_AVALIADOR', 'GERENTE_TREINADOR'];

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
        // Quem só treina precisa do status e dos prazos de experiência para
        // calcular `prazoExperiencia` (abaixo), mas esses campos não saem na
        // resposta dele — só a data do fim do contrato, quando há um.
        ...(verAvaliacoes || verTreinamentos
          ? { status: true, track: true, isApprentice: true, period1DueDate: true, period2DueDate: true }
          : {}),
        // Ciclo de cores e rescisão são da avaliação: só para quem a enxerga.
        ...(verAvaliacoes
          ? { currentColor: true, nextFeedbackDueDate: true, terminationDate: true }
          : {}),
      },
      with: {
        sector: { columns: { id: true, name: true, usesColorCycle: true, usesFeedback: true } },
        unit: { columns: { id: true, name: true } },
        // Só o perfil de quem cadastrou: vira o booleano `criadoPorGerente`
        // abaixo, e o próprio objeto não sai na resposta.
        createdBy: { columns: { role: true } },
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
              with: {
                trainingType: { columns: { id: true, name: true } },
                // Quem treinou: alimenta o filtro por treinador responsável.
                trainer: { columns: { id: true, name: true } },
              },
            },
          }
          : {}),
      },
    });

    // Segunda resposta aberta para quem está olhando (setor com dois gestores).
    // A data do desligamento só serve a essa conta e não sai daqui.
    const avalia = canEvaluate(session.role);
    // Gestores/gerentes que avaliam cada colaborador (escopo de unidade, setor e turno):
    // é o "gerente responsável" dos filtros. Só para quem enxerga avaliação.
    const quemAvalia = verAvaliacoes
      ? (await loadNotifiableAdmins()).filter((a) => canEvaluate(a.role))
      : [];
    const employees = rows.map((row) => {
      const campos = row as unknown as Record<string, unknown>;
      // Vencimento do contrato de experiência em aberto: é o que a aba de
      // treinamento usa para "perto de vencer", e não depende de ver o ciclo.
      const prazoExperiencia = prazoDaExperiencia(campos);
      const { terminationDate, createdBy, ...resto } = campos;
      const criadoPorGerente = PAPEIS_DE_GERENTE.includes((createdBy as { role?: string } | null)?.role ?? '');
      if (!verAvaliacoes) return { ...semCamposDeCiclo(resto), prazoExperiencia, criadoPorGerente };
      // Para a tela, `sector.usesColorCycle` responde se ESTE colaborador está no ciclo de feedback.
      const comCiclo = withFeedbackCycle(resto as { track?: 'NOVO' | 'ATIVO'; sector?: { usesColorCycle: boolean; usesFeedback?: boolean } | null });
      const evs = (campos.evaluations ?? []) as Parameters<typeof secondOpinionFor>[1];
      const segunda = avalia
        ? secondOpinionFor({ isApprentice: campos.isApprentice as boolean | undefined, terminationDate: terminationDate as Date | null | undefined }, evs, session.adminId)
        : null;
      const responsaveis = quemAvalia
        .filter((a) => shouldNotify(a, { unitId: row.unit.id, sectorId: row.sector.id, shift: row.shift }))
        .map((a) => a.name);
      return { ...comCiclo, prazoExperiencia, criadoPorGerente, responsaveis, secondOpinion: segunda ? { period: segunda.period, until: segunda.until } : null };
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
 * Cadastro de colaborador pelo portal da operação — Gestor, Gerente, Líder e
 * Treinador têm `employees.create`. Só dentro do próprio escopo, validado aqui: mandar
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
    // Quem avalia (gestor, gerente, líder) cadastra em qualquer setor do seu
    // escopo. Quem só treina continua preso aos setores do Salão (treinamento):
    // um colaborador de outro setor ficaria invisível para ele.
    const avalia = hasPermission(session.role, 'evaluations.view');
    if (!avalia) await assertTrainingSector(parsed.data.sectorId);

    const track = parsed.data.track ?? 'NOVO';
    if (track === 'ATIVO' && !avalia) {
      throw new ApiError(403, 'Seu perfil cadastra apenas colaboradores novos, para treinamento.');
    }
    // Colaborador antigo só tem o feedback: num setor que não faz feedback ele
    // ficaria cadastrado e invisível em todas as abas.
    if (track === 'ATIVO') {
      const setor = await db.query.sectors.findFirst({
        where: eq(schema.sectors.id, parsed.data.sectorId),
        columns: { usesFeedback: true, usesColorCycle: true },
      });
      if (!sectorDoesFeedback(setor)) {
        throw new ApiError(400, 'Este setor não faz feedback. Escolha um setor que faz, ou fale com o RH.');
      }
    }

    // Cadastro único: o mesmo nome na mesma unidade não entra duas vezes.
    const mesmaUnidade = await db.query.probationaryEmployees.findMany({
      where: eq(schema.probationaryEmployees.unitId, parsed.data.unitId),
      columns: { id: true, fullName: true, unitId: true },
    });
    if (findDuplicate(mesmaUnidade, parsed.data)) {
      return NextResponse.json(
        { error: 'Já existe um colaborador com este nome nesta unidade. Procure pelo nome antes de cadastrar de novo.' },
        { status: 409 },
      );
    }

    // Sem data informada (cadastro do treinador), a admissão é hoje: é o
    // cenário real dele — a pessoa chegou e vai ser treinada agora. Se entrou
    // antes, o RH ajusta no painel e os prazos de 45/90 são recalculados.
    const admissionDate = parsed.data.admissionDate ? new Date(parsed.data.admissionDate) : new Date();

    const [row] = await db
      .insert(schema.probationaryEmployees)
      .values({
        fullName: parsed.data.fullName,
        admissionDate,
        roleDescription: parsed.data.roleDescription,
        sectorId: parsed.data.sectorId,
        unitId: parsed.data.unitId,
        shift: parsed.data.shift,
        ...cycleFieldsFor(track, admissionDate),
        createdById: session.adminId,
      })
      .returning();

    await logAudit({
      adminId: session.adminId,
      action: 'employee.create',
      entityType: 'ProbationaryEmployee',
      entityId: row.id,
      metadata: { origem: 'portal-operacao', papel: session.role, trilha: track },
      req,
    });
    await notifyActivity({ type: 'EMPLOYEE_CREATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
