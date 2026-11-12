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
import { usesFeedbackCycle, sectorDoesFeedback } from '@/lib/feedbackParticipation';
import { formForPeriod, validateCustomAnswers } from '@/lib/questionnaire';
import { liveQuestionsFor } from '@/lib/questionnaireService';
import { unidadeUsaRoteiroPdi } from '@/data/roteiroPdi';
import { setorAvaliaUniforme } from '@/data/uniforme';
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
      with: {
        sector: { columns: { id: true, name: true, usesColorCycle: true, usesFeedback: true } },
        unit: { columns: { name: true } },
      },
    });
    if (!employee) throw new ApiError(404, 'Funcionário não encontrado.');
    if (!isInScope(session, employee)) {
      throw new ApiError(403, 'Este funcionário não está no seu escopo.');
    }

    // O ciclo de cores é do Salão: quem está num setor sem a chave ligada faz
    // as avaliações de 45 e 90 dias normalmente, efetiva sem cor e não entra
    // no ciclo permanente de feedback. Quem decide isso é o cadastro do setor
    // (sectors.usesColorCycle), lido aqui no servidor — a tela não é a fonte.
    // Colaborador ATIVO participa do feedback em qualquer setor (feedbackParticipation.ts).
    const usaCores = usesFeedbackCycle(employee.sector?.usesColorCycle, employee.track);

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
        track: employee.track,
        evaluations: anteriores,
      });
    // Feedback é escolha do setor (cores implicam feedback). Sem as cores o feedback é
    // avulso: o gestor registra quando quiser, sem data agendada.
    if (period === 'FEEDBACK' && !sectorDoesFeedback(employee.sector)) {
      throw new ApiError(409, 'O setor deste colaborador não faz feedback. O RH pode incluí-lo em Setores.');
    }

    // Feedback de Paulista e JK é o roteiro PDI, que substitui as 4 dimensões da
    // ficha padrão. Quem decide é a unidade do colaborador no banco, não o
    // corpo da requisição.
    const usaRoteiro = period === 'FEEDBACK' && unidadeUsaRoteiroPdi(employee.unit?.name);
    if (usaRoteiro && !data.roteiro) {
      return NextResponse.json({ error: 'O feedback desta unidade é feito pelo roteiro (PDI): dê uma nota para cada item.' }, { status: 400 });
    }
    if (!usaRoteiro && data.roteiro) {
      return NextResponse.json({ error: 'O roteiro PDI só se aplica ao feedback das unidades Paulista e JK.' }, { status: 400 });
    }
    if (!usaRoteiro && !data.flexibilityRating) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    // Uniforme: faz parte do feedback dos setores do Salão (Atendimento, Bar e
    // Gerência). O setor vem do banco, não do corpo da requisição.
    const usaUniforme = period === 'FEEDBACK' && setorAvaliaUniforme(employee.sector?.name);
    if (usaUniforme && !data.uniformRating) {
      return NextResponse.json({ error: 'Avalie o uniforme: dê uma nota.' }, { status: 400 });
    }
    if (!usaUniforme && (data.uniformRating || data.uniformNotes)) {
      return NextResponse.json({ error: 'A avaliação do uniforme só se aplica ao feedback dos setores do Salão.' }, { status: 400 });
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

    // Perguntas extras do setor (aprovadas pelo RH): obrigatórias respondidas, e o texto
    // de cada uma fica gravado junto da resposta.
    const extras = (await liveQuestionsFor(employee.sectorId))[formForPeriod(period)];
    const respostasExtras = validateCustomAnswers(extras, data.customAnswers);
    if (!respostasExtras.ok) {
      return NextResponse.json({ error: respostasExtras.error, missingQuestionIds: respostasExtras.missingIds }, { status: 400 });
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
        flexibilityRating: data.flexibilityRating ?? null,
        flexibilitySubAnswers: data.flexibilitySubAnswers ?? null,
        interestRating: data.interestRating ?? null,
        interestSubAnswers: data.interestSubAnswers ?? null,
        relationshipRating: data.relationshipRating ?? null,
        relationshipSubAnswers: data.relationshipSubAnswers ?? null,
        learningRating: data.learningRating ?? null,
        learningSubAnswers: data.learningSubAnswers ?? null,
        roteiro: data.roteiro ?? null,
        uniformRating: data.uniformRating ?? null,
        uniformNotes: data.uniformNotes || null,
        customAnswers: respostasExtras.answered.length > 0 ? respostasExtras.answered : null,
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
        employeeId: employee.id, period, cycleNumber, conclusion: data.conclusion ?? null, color, ...(usaRoteiro ? { roteiroPdi: true } : {}),
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
