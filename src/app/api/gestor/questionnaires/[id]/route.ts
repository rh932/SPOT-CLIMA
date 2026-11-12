export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';
import { gestorActor } from '@/lib/questionnaireActors';
import { questionnaireQuestionUpdateSchema, questionnaireActionSchema } from '@/lib/validation';
import { actOnQuestion, updateQuestion } from '@/lib/questionnaireService';

/** Editar o texto, o tipo ou a obrigatoriedade. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'questionnaires.manage');
    const actor = gestorActor(session);
    const parsed = questionnaireQuestionUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    return NextResponse.json({ question: await updateQuestion(actor, params.id, parsed.data, req) });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Enviar para o RH, retirar da análise ou arquivar (o que ainda é só dele). */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireGestor();
    requirePermission(session, 'questionnaires.manage');
    const actor = gestorActor(session);
    const parsed = questionnaireActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    return NextResponse.json({ question: await actOnQuestion(actor, params.id, parsed.data.action, parsed.data.note, req) });
  } catch (err) {
    return handleApiError(err);
  }
}
