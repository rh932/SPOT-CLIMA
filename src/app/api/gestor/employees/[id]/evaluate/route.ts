export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { requireGestor, handleApiError, ApiError } from '@/lib/apiAuth';
import { isInScope, canEvaluate } from '@/lib/scope';
import { evaluationSubmissionSchema } from '@/lib/validation';
import { nextStatusAfterConclusion, saoPauloDay, utcDay, type EvaluationPeriod } from '@/lib/probation';
import { nextFeedbackDate, type FeedbackColor } from '@/lib/feedbackCycle';
import { statusFromEvaluations } from '@/lib/termination';
import { secondOpinionFor, SEGUNDA_RESPOSTA_DIAS } from '@/lib/secondOpinion';
import { nextEvaluationPeriod, type ColorUnlockInput } from '@/lib/colorUnlock';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

type EvaluationKind = EvaluationPeriod | 'FEEDBACK';

/**
 * O período nunca vem do cliente: é derivado no servidor, fechando o vetor de
 * manipulação de avaliar o ciclo errado. Um funcionário já efetivado (HIRED)
 * está no ciclo permanente de feedback — exceto quem foi efetivado na 1ª
 * avaliação num setor do projeto de cores: para ele a 2ª avaliação de
 * experiência ainda é devida, e é nela que a cor é liberada (colorUnlock.ts).
 */
function periodFor(input: ColorUnlockInput): EvaluationKind {
  if (input.status === 'TERMINATED') throw new ApiError(409, 'Funcionário desligado não recebe novas avaliações.');
  return nextEvaluationPeriod(input) ?? 'FEEDBACK';
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();

    // Só o gestor do turno avalia: o Líder acompanha e cobra, o Treinador nem
    // enxerga avaliação.
    if (!canEvaluate(session.role)) {
      throw new ApiError(403, 'Quem preenche a avaliação é o gestor responsável pelo turno.');
    }

    const employee = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, params.id),
      with: { sector: { columns: { id: true, name: true, usesColorCycle: true } } },
    });
    if (!employee) throw new ApiError(404, 'Funcionário não encontrado.');
    if (!isInScope(session, employee)) {
      throw new ApiError(403, 'Este funcionário não está no seu escopo.');
    }

    // O ciclo de cores é do Salão: quem está num setor sem a chave ligada faz
    // as avaliações de 45 e 90 dias normalmente, efetiva sem cor e não entra
    // no ciclo permanente de feedback. Quem decide isso é o cadastro do setor
    // (sectors.usesColorCycle), lido aqui no servidor — a tela não é a fonte.
    const usaCores = employee.sector?.usesColorCycle ?? false;

    if (employee.isApprentice) {
      throw new ApiError(409, 'Jovem aprendiz tem contrato de aprendizagem e não passa pela avaliação de experiência.');
    }
    const body = await req.json().catch(() => null);
    const parsed = evaluationSubmissionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    const data = parsed.data;

    // A data vem do gestor e decide prazo cumprido e próximo feedback: data no
    // futuro empurrava o próximo ciclo para longe (e calava os lembretes), e
    // data antes da admissão não existe. Avaliação feita no papel dias atrás
    // continua aceita.
    const diaAvaliacao = saoPauloDay(new Date(data.evaluationDate));
    if (diaAvaliacao > saoPauloDay() || diaAvaliacao < utcDay(employee.admissionDate)) {
      throw new ApiError(400, 'A data da avaliação precisa estar entre a admissão e hoje.');
    }

    // Segunda resposta: o período é o que outro gestor acabou de avaliar, e a
    // regra de quando isso ainda vale mora em secondOpinion.ts — a mesma que a
    // ficha usa para mostrar o botão.
    // O histórico também decide o período normal (2ª avaliação ainda devida
    // para quem foi efetivado na 1ª), por isso é lido sempre.
    const anteriores = await db.query.performanceEvaluations.findMany({
      where: eq(schema.performanceEvaluations.employeeId, employee.id),
      columns: { period: true, cycleNumber: true, evaluatorAdminId: true, evaluationDate: true, conclusion: true },
    });
    const segunda = data.secondOpinion ? secondOpinionFor(employee, anteriores, session.adminId) : null;
    if (data.secondOpinion && !segunda) {
      throw new ApiError(409, 'A segunda resposta deste período não está mais aberta: você já respondeu, o prazo de '
        + `${SEGUNDA_RESPOSTA_DIAS} dias passou, o próximo período já foi avaliado ou o RH registrou o desligamento.`);
    }

    const period: EvaluationKind = segunda
      ? segunda.period
      : periodFor({
        status: employee.status,
        isApprentice: employee.isApprentice,
        currentColor: employee.currentColor,
        usesColorCycle: usaCores,
        evaluations: anteriores,
      });
    if (period === 'FEEDBACK' && !usaCores) {
      throw new ApiError(409, 'O setor deste colaborador não participa do ciclo de feedback por cores.');
    }

    // Conclusão só existe na experiência; cor só a partir do momento em que o
    // colaborador entra no ciclo permanente (efetivação nos 90 dias). Na
    // segunda resposta, só quando o primeiro gestor ainda não deu a cor.
    const startsFeedbackCycle = period === 'SECOND' && data.conclusion === 'EFETIVAR' && usaCores
      && (!segunda || !employee.currentColor);
    const needsColor = (period === 'FEEDBACK' || startsFeedbackCycle) && usaCores;

    if (period === 'FEEDBACK') {
      if (data.conclusion) {
        return NextResponse.json({ error: 'Feedback de colaborador efetivado não tem conclusão de experiência.' }, { status: 400 });
      }
    } else if (!data.conclusion) {
      return NextResponse.json({ error: 'Informe a conclusão da avaliação.' }, { status: 400 });
    } else if (data.conclusion === 'EXTENDER' && period === 'SECOND') {
      return NextResponse.json({ error: 'Não é possível estender além do 2º ciclo.' }, { status: 400 });
    }

    if (needsColor && !data.color) {
      return NextResponse.json({ error: 'Informe a classificação por cor, que define a data do próximo feedback.' }, { status: 400 });
    }
    if (!needsColor && data.color) {
      return NextResponse.json(
        {
          error: segunda && employee.currentColor
            ? 'A cor já foi definida na primeira resposta; para mudar, use "Mudar a classificação" na ficha.'
            : usaCores
            ? 'A classificação por cor só se aplica a partir da efetivação.'
            : 'O setor deste colaborador não participa do projeto de cores.',
        },
        { status: 400 },
      );
    }

    const evaluationDate = new Date(data.evaluationDate);
    const color = (data.color ?? null) as FeedbackColor | null;
    const nextDueDate = color ? nextFeedbackDate(evaluationDate, color) : null;

    // Prazo do ciclo vem do cadastro, não do cliente: é o que registra se a
    // avaliação foi feita dentro ou fora do prazo. No ciclo permanente, o prazo
    // é a data que a cor anterior agendou.
    const dueDateAtEvaluation =
      period === 'FIRST'
        ? employee.period1DueDate
        : period === 'SECOND'
          ? employee.period2DueDate
          : (employee.nextFeedbackDueDate ?? evaluationDate);

    // Feedbacks se repetem, então a ordem dentro do período é contada; FIRST e
    // SECOND ficam sempre em 1, garantido pelo unique (employee, period, cycle).
    // A segunda resposta entra depois das que o período já tem.
    let cycleNumber = 1;
    if (segunda) {
      cycleNumber = Math.max(0, ...anteriores.filter((e) => e.period === period).map((e) => e.cycleNumber)) + 1;
    } else if (period === 'FEEDBACK') {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.performanceEvaluations)
        .where(and(
          eq(schema.performanceEvaluations.employeeId, employee.id),
          eq(schema.performanceEvaluations.period, 'FEEDBACK'),
        ));
      cycleNumber = count + 1;
    }

    const [evaluation] = await db
      .insert(schema.performanceEvaluations)
      .values({
        employeeId: employee.id,
        period,
        cycleNumber,
        evaluationDate,
        dueDateAtEvaluation,
        evaluatorAdminId: session.adminId,
        flexibilityRating: data.flexibilityRating,
        flexibilitySubAnswers: data.flexibilitySubAnswers,
        interestRating: data.interestRating,
        interestSubAnswers: data.interestSubAnswers,
        relationshipRating: data.relationshipRating,
        relationshipSubAnswers: data.relationshipSubAnswers,
        learningRating: data.learningRating,
        learningSubAnswers: data.learningSubAnswers,
        favorableAspects: data.favorableAspects,
        unfavorableAspects: data.unfavorableAspects,
        classification: data.classification,
        conclusion: data.conclusion ?? null,
        color,
        nextDueDate,
        developmentPoints: data.developmentPoints ?? null,
        guidance: data.guidance ?? null,
        trainingNeeds: data.trainingNeeds ?? null,
      })
      // Um setor pode ter mais de um gestor no mesmo turno, e os dois enxergam
      // o mesmo funcionário. A avaliação é uma só por ciclo: se outro gestor
      // chegou primeiro — inclusive por um clique simultâneo — o banco recusa
      // aqui, e a resposta abaixo diz quem avaliou, em vez de estourar um erro.
      .onConflictDoNothing()
      .returning();

    if (!evaluation) {
      const existing = await db.query.performanceEvaluations.findFirst({
        where: and(
          eq(schema.performanceEvaluations.employeeId, employee.id),
          eq(schema.performanceEvaluations.period, period),
          eq(schema.performanceEvaluations.cycleNumber, cycleNumber),
        ),
        with: { evaluator: { columns: { name: true } } },
      });
      return NextResponse.json(
        {
          error: existing
            ? `Esta avaliação já foi registrada por ${existing.evaluator?.name ?? 'outro gestor'} em ${existing.evaluationDate.toLocaleDateString('pt-BR')}.`
            : 'Esta avaliação já foi registrada por outro gestor.',
          alreadyEvaluated: true,
          evaluator: existing?.evaluator?.name ?? null,
          evaluationDate: existing?.evaluationDate ?? null,
        },
        { status: 409 },
      );
    }

    // No ciclo permanente o status não muda: o colaborador segue HIRED, só a
    // cor e a próxima data são recalculadas.
    // Na segunda resposta vale a mais recente da experiência — a regra que a
    // importação do Forms já seguia (statusFromEvaluations). A nova entra por
    // último, então no empate de data é ela que decide.
    const newStatus = period === 'FEEDBACK'
      ? employee.status
      : segunda
        ? statusFromEvaluations([...anteriores, { period, conclusion: data.conclusion!, evaluationDate }], false)
        : nextStatusAfterConclusion(data.conclusion!, period);
    const conclusoesDiferentes = Boolean(segunda && segunda.first.conclusion && segunda.first.conclusion !== data.conclusion);

    await db
      .update(schema.probationaryEmployees)
      .set({
        status: newStatus,
        currentColor: color ?? employee.currentColor,
        // Desligar encerra o ciclo; qualquer outra saída mantém ou recalcula.
        nextFeedbackDueDate: newStatus === 'TERMINATED' ? null : (nextDueDate ?? employee.nextFeedbackDueDate),
        updatedAt: new Date(),
      })
      .where(eq(schema.probationaryEmployees.id, employee.id));

    // A troca de cor vira registro próprio — é o que responde "por que a
    // cadência deste colaborador mudou?" sem comparar duas avaliações.
    if (color && nextDueDate && color !== employee.currentColor) {
      await db.insert(schema.employeeColorChanges).values({
        employeeId: employee.id,
        evaluationId: evaluation.id,
        previousColor: employee.currentColor,
        newColor: color,
        reason: data.colorReason?.trim() || 'Classificação definida na avaliação.',
        nextDueDate,
        changedByAdminId: session.adminId,
      });
    }

    await logAudit({
      adminId: session.adminId,
      action: 'evaluation.submit',
      entityType: 'PerformanceEvaluation',
      entityId: evaluation.id,
      metadata: {
        employeeId: employee.id, period, cycleNumber, conclusion: data.conclusion ?? null, color,
        ...(segunda ? { secondOpinion: true, firstConclusion: segunda.first.conclusion, conclusoesDiferentes } : {}),
      },
      req,
    });

    await notifyActivity({ type: 'EVALUATION_SUBMITTED', employee, period }, session.adminId);

    return NextResponse.json(
      { evaluation, employeeStatus: newStatus, nextFeedbackDueDate: nextDueDate, secondOpinion: Boolean(segunda), conclusoesDiferentes },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
