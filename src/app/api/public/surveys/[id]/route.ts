export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';

/**
 * Rota pública usada pela área do colaborador. Retorna uma pesquisa
 * específica (por id) com suas perguntas e os setores/unidades ativos —
 * só se ela estiver OPEN. Não requer autenticação.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const survey = await db.query.surveys.findFirst({
    where: and(eq(schema.surveys.id, params.id), eq(schema.surveys.status, 'OPEN')),
  });
  if (!survey) {
    return NextResponse.json({ error: 'Esta pesquisa não está mais aberta.' }, { status: 404 });
  }

  const questions = await db.query.questions.findMany({
    where: and(eq(schema.questions.surveyId, survey.id), eq(schema.questions.active, true)),
    orderBy: asc(schema.questions.order),
    with: { dimension: true, options: { orderBy: (o, { asc }) => asc(o.order) } },
  });

  const sectors = await db.query.sectors.findMany({
    where: and(eq(schema.sectors.active, true), eq(schema.sectors.inSurvey, true)),
    orderBy: asc(schema.sectors.order),
  });

  const units = await db.query.units.findMany({
    where: eq(schema.units.active, true),
    orderBy: asc(schema.units.order),
  });

  return NextResponse.json({
    survey: { id: survey.id, name: survey.name, description: survey.description, requireAccessCode: survey.requireAccessCode },
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      required: q.required,
      dimension: q.dimension ? { id: q.dimension.id, name: q.dimension.name, order: q.dimension.order } : null,
      options: q.options.map((o) => ({ id: o.id, label: o.label })),
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
      isEnps: q.isEnps,
    })),
    sectors: sectors.map((s) => ({ id: s.id, name: s.name })),
    units: units.map((u) => ({ id: u.id, name: u.name })),
  });
}
