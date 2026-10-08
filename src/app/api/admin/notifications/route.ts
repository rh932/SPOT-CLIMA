export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { daysBetween, feedbackStatus } from '@/lib/feedbackCycle';
import { listInbox, markInboxRead } from '@/lib/notificationInbox';

/** Quantos dias à frente o sino do admin olha. */
const HORIZON_DAYS = 7;

/**
 * Sino do admin — duas coisas lado a lado:
 *
 * - `notifications`: a caixa de movimentações (avaliação registrada,
 *   treinamento, cadastro...), igual à do gestor, com lidas e não lidas;
 * - `items`: a situação do ciclo de feedback agora (vencendo em até 7 dias e
 *   atrasados), calculada na hora a partir dos vencimentos. O RH não recebe
 *   um lembrete por colaborador — resolver um feedback some da lista sem
 *   precisar marcar nada como lido.
 */
export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.view');

    const rows = await db.query.probationaryEmployees.findMany({
      where: and(
        eq(schema.probationaryEmployees.status, 'HIRED'),
        eq(schema.probationaryEmployees.isApprentice, false),
        isNotNull(schema.probationaryEmployees.nextFeedbackDueDate),
      ),
      orderBy: asc(schema.probationaryEmployees.nextFeedbackDueDate),
      columns: { id: true, fullName: true, currentColor: true, nextFeedbackDueDate: true },
      with: {
        sector: { columns: { name: true, usesColorCycle: true } },
        unit: { columns: { name: true } },
      },
    });

    const now = new Date();
    const items = rows
      // Mesmo filtro do cron: setor fora do projeto de cores não tem ciclo de
      // feedback, mesmo que o colaborador tenha ficado com uma data antiga.
      .filter((employee) => employee.sector?.usesColorCycle)
      .map((employee) => {
        const due = employee.nextFeedbackDueDate!;
        return {
          ...employee,
          dias: daysBetween(now, due),
          status: feedbackStatus({ nextDueDate: due }, now),
        };
      })
      .filter((item) => item.dias <= HORIZON_DAYS);

    return NextResponse.json({
      items,
      atrasados: items.filter((i) => i.status === 'EM_ATRASO').length,
      total: items.length,
      ...(await listInbox(session.adminId)),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Marca avisos como lidos — todos, ou só os `ids` enviados. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'notifications.receive');
    const body = await req.json().catch(() => null);
    return NextResponse.json({ ok: true, lidas: await markInboxRead(session.adminId, body) });
  } catch (err) {
    return handleApiError(err);
  }
}
