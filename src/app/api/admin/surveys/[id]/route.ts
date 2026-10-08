export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, asc, count } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireAnyPermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { surveySchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requireAnyPermission(session, ['surveys.manage', 'reports.view']);
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    const questions = await db.query.questions.findMany({
      where: eq(schema.questions.surveyId, params.id),
      orderBy: asc(schema.questions.order),
      with: { dimension: true, options: { orderBy: (o, { asc }) => asc(o.order) } },
    });
    return NextResponse.json({ survey, questions });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status !== 'DRAFT' && survey.status !== 'SCHEDULED') {
      throw new ApiError(400, 'Só é possível editar pesquisas em rascunho ou agendadas. Encerre ou use um novo ciclo para mudanças estruturais.');
    }

    const body = await req.json().catch(() => null);
    const parsed = surveySchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db
      .update(schema.surveys)
      .set({
        ...parsed.data,
        openDate: parsed.data.openDate ? new Date(parsed.data.openDate) : undefined,
        closeDate: parsed.data.closeDate ? new Date(parsed.data.closeDate) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.surveys.id, params.id))
      .returning();

    // Quais campos mudaram — e o limite de anonimato com o valor, porque é ele
    // que decide quantas pessoas cada número precisa ter.
    await logAudit({
      adminId: session.adminId,
      action: 'survey.update',
      entityType: 'Survey',
      entityId: row.id,
      metadata: {
        campos: Object.keys(parsed.data),
        ...(parsed.data.anonymityThreshold !== undefined && parsed.data.anonymityThreshold !== survey.anonymityThreshold
          ? { limiteDe: survey.anonymityThreshold, limitePara: parsed.data.anonymityThreshold }
          : {}),
      },
      req,
    });
    return NextResponse.json({ survey: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, params.id) });
    if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
    if (survey.status === 'OPEN') {
      throw new ApiError(400, 'Não é possível excluir uma pesquisa aberta. Encerre-a primeiro.');
    }

    const [{ respostas }] = await db
      .select({ respostas: count() })
      .from(schema.surveyResponses)
      .where(eq(schema.surveyResponses.surveyId, params.id));
    if (respostas > 0) {
      // Com respostas, só o Super Admin apaga — e só depois de uma segunda
      // confirmação que mostra quanto histórico vai junto (respostas, notas e
      // resumo saem em cascata; planos de ação ficam, sem a pesquisa).
      if (session.role !== 'SUPER_ADMIN') {
        throw new ApiError(409, 'Esta pesquisa já tem respostas coletadas. Só o Super Admin pode excluí-la; você pode arquivá-la para tirá-la da lista.');
      }
      if (req.nextUrl.searchParams.get('apagarRespostas') !== 'true') {
        return NextResponse.json(
          { error: `Esta pesquisa tem ${respostas} resposta(s) coletada(s).`, precisaConfirmarRespostas: true, respostas },
          { status: 409 },
        );
      }
    }

    await db.transaction(async (tx) => {
      // Respostas antes da pesquisa: response_answers aponta para questions sem
      // cascata, e a cascata única surveys → questions esbarra nessa FK antes
      // de a cascata surveys → responses → answers limpar as notas.
      await tx.delete(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, params.id));
      await tx.delete(schema.surveys).where(eq(schema.surveys.id, params.id));
    });
    await logAudit({
      adminId: session.adminId,
      action: respostas > 0 ? 'survey.delete_with_responses' : 'survey.delete',
      entityType: 'Survey',
      entityId: params.id,
      metadata: respostas > 0 ? { respostas, nome: survey.name } : undefined,
      req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
