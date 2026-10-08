export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { terminationSchema } from '@/lib/validation';
import { statusFromEvaluations } from '@/lib/termination';
import { saoPauloDay, utcDay } from '@/lib/probation';
import { logAudit } from '@/lib/audit';
import { notifyActivity } from '@/lib/notify';

/**
 * Desligamento registrado pelo RH, com motivo e data.
 *
 * Antes só a avaliação com conclusão "Demitir" desligava alguém; quem pedia
 * demissão ou abandonava o emprego no meio da experiência ficava na lista
 * como "Aguardando 1º ciclo" e continuava gerando lembrete para o gestor.
 * Também serve para corrigir motivo e data de um desligamento já registrado.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.edit');

    const body = await req.json().catch(() => null);
    const parsed = terminationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }

    const existing = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, params.id),
      columns: { id: true, admissionDate: true, status: true, previousStatus: true },
    });
    if (!existing) throw new ApiError(404, 'Funcionário não encontrado.');
    const date = new Date(parsed.data.date);
    // Por dia de calendário: a tela manda o meio-dia de São Paulo, a admissão
    // é gravada como um instante qualquer do dia em UTC.
    if (saoPauloDay(date) < utcDay(existing.admissionDate)) {
      return NextResponse.json({ error: 'A data de saída não pode ser anterior à admissão.' }, { status: 400 });
    }

    const [row] = await db
      .update(schema.probationaryEmployees)
      .set({
        status: 'TERMINATED',
        // O "desfazer" volta para cá. Corrigir motivo/data de quem já está
        // desligado não mexe no que foi guardado da primeira vez.
        previousStatus: existing.status === 'TERMINATED' ? existing.previousStatus : existing.status,
        terminationReason: parsed.data.reason,
        terminationDate: date,
        terminationNotes: parsed.data.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.probationaryEmployees.id, params.id))
      .returning();

    await logAudit({
      adminId: session.adminId,
      action: 'employee.terminate',
      entityType: 'ProbationaryEmployee',
      entityId: row.id,
      metadata: { reason: parsed.data.reason, date: parsed.data.date },
      req,
    });
    await notifyActivity({ type: 'EMPLOYEE_UPDATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Desfaz um desligamento lançado por engano. A situação volta a ser a de
 * antes do registro (previousStatus). Sem ela — desligado que veio da
 * importação —, vale a que as avaliações dão; e se a última concluiu
 * "Demitir", não há o que desfazer aqui: o desligamento veio da avaliação.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'employees.edit');

    const existing = await db.query.probationaryEmployees.findFirst({
      where: eq(schema.probationaryEmployees.id, params.id),
      columns: { id: true, isApprentice: true, terminationReason: true, previousStatus: true },
      with: { evaluations: { columns: { period: true, conclusion: true, evaluationDate: true } } },
    });
    if (!existing) throw new ApiError(404, 'Funcionário não encontrado.');
    if (!existing.terminationReason) {
      throw new ApiError(409, 'Não há desligamento registrado pelo RH para desfazer.');
    }
    const status = existing.previousStatus ?? statusFromEvaluations(existing.evaluations, existing.isApprentice);
    if (status === 'TERMINATED') {
      throw new ApiError(409, 'A última avaliação concluiu "Demitir": o desligamento vem dela e não pode ser desfeito aqui.');
    }

    const [row] = await db
      .update(schema.probationaryEmployees)
      .set({
        status, previousStatus: null, terminationReason: null, terminationDate: null, terminationNotes: null, updatedAt: new Date(),
      })
      .where(eq(schema.probationaryEmployees.id, params.id))
      .returning();

    await logAudit({ adminId: session.adminId, action: 'employee.unterminate', entityType: 'ProbationaryEmployee', entityId: row.id, req });
    await notifyActivity({ type: 'EMPLOYEE_UPDATED', employee: row }, session.adminId);
    return NextResponse.json({ employee: row });
  } catch (err) {
    return handleApiError(err);
  }
}
