export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { buildReminderRows, JANELA_AGORA } from '@/lib/reminders';
import { deliverNotifications } from '@/lib/notify';
import { logAudit } from '@/lib/audit';

/**
 * "Lembrar gestores agora": manda na hora, para cada gestor, o lembrete de
 * cada avaliação atrasada ou que vence em até 7 dias na equipe dele — sem
 * esperar os dias fixos da rotina diária. Mesma regra de destinatário e de
 * texto da rotina (src/lib/reminders.ts).
 *
 * GET é a prévia da confirmação (quantas avaliações, quantos gestores, quantos
 * com celular); POST envia. Repetir no mesmo dia não duplica: o unique de
 * `notifications` descarta o que já foi mandado.
 */

async function comCelular(adminIds: string[]): Promise<number> {
  if (adminIds.length === 0) return 0;
  const subs = await db.query.pushSubscriptions.findMany({
    where: inArray(schema.pushSubscriptions.adminId, adminIds),
    columns: { adminId: true },
  });
  return new Set(subs.map((s) => s.adminId)).size;
}

export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.view');
    const plano = await buildReminderRows('agora');
    const gestores = [...new Set(plano.rows.map((r) => r.adminId))];
    return NextResponse.json({
      janelaDias: JANELA_AGORA,
      avaliacoes: plano.naJanela,
      atrasadas: new Set(plano.rows.filter((r) => (r.offsetDays ?? 0) < 0).map((r) => r.employeeId)).size,
      semGestor: plano.semGestor,
      gestores: gestores.length,
      gestoresComCelular: await comCelular(gestores),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'evaluations.view');
    const plano = await buildReminderRows('agora');
    const entrega = await deliverNotifications(plano.rows);
    const gestores = new Set(plano.rows.map((r) => r.adminId)).size;

    await logAudit({
      adminId: session.adminId,
      action: 'reminders.send_now',
      metadata: { avaliacoes: plano.naJanela, gestores, avisos: entrega.avisos, repetidos: entrega.repetidos, push: entrega.push },
      req,
    });

    return NextResponse.json({ ok: true, avaliacoes: plano.naJanela, gestores, semGestor: plano.semGestor, ...entrega });
  } catch (err) {
    return handleApiError(err);
  }
}
