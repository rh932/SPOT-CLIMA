export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError } from '@/lib/apiAuth';
import { templateQuestionBaseSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { enpsQuestionFields } from '@/lib/enps';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const body = await req.json().catch(() => null);
    const parsed = templateQuestionBaseSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    // eNPS: escala fixa de 0 a 10 e sem opções (src/lib/enps.ts).
    const data = parsed.data.isEnps ? { ...enpsQuestionFields(parsed.data), options: [] } : parsed.data;
    const { options, ...rest } = data;
    const [row] = await db.update(schema.templateQuestions).set(rest).where(eq(schema.templateQuestions.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Pergunta não encontrada.' }, { status: 404 });

    if (options) {
      await db.delete(schema.templateQuestionOptions).where(eq(schema.templateQuestionOptions.templateQuestionId, row.id));
      if (options.length > 0) {
        await db.insert(schema.templateQuestionOptions).values(
          options.map((o, idx) => ({ templateQuestionId: row.id, label: o.label, order: o.order ?? idx }))
        );
      }
    }

    await logAudit({ adminId: session.adminId, action: 'template_question.update', entityType: 'TemplateQuestion', entityId: row.id, req });
    return NextResponse.json({ question: row });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    // Exclusão real: diferente de questions/[id], nada aponta para uma pergunta
    // de modelo (pesquisas copiam as perguntas; respostas ficam nas cópias), e as
    // opções saem em cascata. O soft-delete antigo deixava a pergunta na tela.
    const [row] = await db.delete(schema.templateQuestions).where(eq(schema.templateQuestions.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Pergunta não encontrada.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'template_question.delete', entityType: 'TemplateQuestion', entityId: row.id, req });
    return NextResponse.json({ question: row });
  } catch (err) {
    return handleApiError(err);
  }
}
