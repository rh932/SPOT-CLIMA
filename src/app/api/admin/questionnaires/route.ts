export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { adminActor } from '@/lib/questionnaireActors';
import { questionnaireQuestionSchema } from '@/lib/validation';
import { createQuestion, listQuestions } from '@/lib/questionnaireService';
import type { QuestionForm, QuestionStatus } from '@/lib/questionnaire';
import { db } from '@/db';
import { asc } from 'drizzle-orm';
import * as schema from '@/db/schema';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'questionnaires.review');
    const actor = adminActor(session);
    const p = req.nextUrl.searchParams;
    const [questions, sectors] = await Promise.all([
      listQuestions(actor, {
        sectorId: p.get('sectorId') || undefined,
        form: (p.get('form') as QuestionForm) || undefined,
        status: (p.get('status') as QuestionStatus) || undefined,
      }),
      db.query.sectors.findMany({
        where: (s, { eq }) => eq(s.active, true),
        columns: { id: true, name: true, usesColorCycle: true, usesFeedback: true },
        orderBy: asc(schema.sectors.order),
      }),
    ]);
    return NextResponse.json({ questions, sectors });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Pergunta escrita pelo RH já nasce aprovada. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'questionnaires.review');
    const actor = adminActor(session);
    const parsed = questionnaireQuestionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    return NextResponse.json({ question: await createQuestion(actor, parsed.data, req) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
