export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireGestor, requirePermission, handleApiError } from '@/lib/apiAuth';
import { gestorActor } from '@/lib/questionnaireActors';
import { questionnaireQuestionSchema } from '@/lib/validation';
import { createQuestion, listQuestions } from '@/lib/questionnaireService';
import type { QuestionForm, QuestionStatus } from '@/lib/questionnaire';
import { db } from '@/db';
import { inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';

export async function GET(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'questionnaires.manage');
    const actor = gestorActor(session);
    const p = req.nextUrl.searchParams;
    const questions = await listQuestions(actor, {
      sectorId: p.get('sectorId') || undefined,
      form: (p.get('form') as QuestionForm) || undefined,
      status: (p.get('status') as QuestionStatus) || undefined,
    });
    const sectors = actor.sectorIds && actor.sectorIds.length > 0
      ? await db.query.sectors.findMany({
        where: inArray(schema.sectors.id, actor.sectorIds),
        columns: { id: true, name: true, usesColorCycle: true, usesFeedback: true },
        orderBy: (s, { asc }) => asc(s.order),
      })
      : [];
    return NextResponse.json({ questions, sectors });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireGestor();
    requirePermission(session, 'questionnaires.manage');
    const actor = gestorActor(session);
    const parsed = questionnaireQuestionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    const question = await createQuestion(actor, parsed.data, req);
    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
