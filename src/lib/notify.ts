import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendPushToAdmins, type PushResult } from './push';
import { notificationPayload, type NotificationType } from './pushPayload';
import { activityEmployeeId, activityMessage, activityTargets, type ActivityEvent } from './notificationEvents';
import type { NotifiableAdmin } from './notificationTargets';

/**
 * Entrega de avisos: grava no sino e toca o celular. É o único caminho — a
 * rotina diária de lembretes e as movimentações feitas nas telas passam por
 * aqui, para que as duas sigam as mesmas regras de idempotência e de falha.
 */

export type NotifiableAdminWithName = NotifiableAdmin & { name: string };

/** Contas ativas com o escopo já achatado, prontas para as regras de destinatário. */
export async function loadNotifiableAdmins(): Promise<NotifiableAdminWithName[]> {
  const admins = await db.query.admins.findMany({
    where: eq(schema.admins.active, true),
    columns: { id: true, name: true, role: true, active: true },
    with: {
      scopedUnits: { columns: { unitId: true } },
      scopedSectors: { columns: { sectorId: true } },
      scopedShifts: { columns: { shift: true } },
    },
  });
  return admins.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    active: a.active,
    scopedUnitIds: a.scopedUnits.map((u) => u.unitId),
    scopedSectorIds: a.scopedSectors.map((s) => s.sectorId),
    scopedShifts: a.scopedShifts.map((s) => s.shift),
  }));
}

export interface NotificationRow {
  adminId: string;
  type: NotificationType;
  employeeId: string | null;
  message: string;
  dueDate?: Date | null;
  offsetDays?: number | null;
  actorAdminId?: string | null;
}

export interface DeliveryResult {
  avisos: number;
  repetidos: number;
  push: PushResult;
}

/**
 * Grava os avisos e manda push só do que ACABOU de entrar.
 *
 * O `onConflictDoNothing` sobre o unique de `notifications` faz um lembrete
 * repetido não virar linha nova; usar o retorno do insert faz o celular
 * herdar a mesma idempotência — rodar a rotina duas vezes no mesmo dia não
 * toca o telefone de ninguém duas vezes.
 *
 * Uma falha de push nunca derruba a entrega: o sino já foi gravado.
 */
export async function deliverNotifications(rows: NotificationRow[]): Promise<DeliveryResult> {
  const push: PushResult = { enviados: 0, removidos: 0, falhas: 0 };
  if (rows.length === 0) return { avisos: 0, repetidos: 0, push };

  const inserted = await db
    .insert(schema.notifications)
    .values(rows.map((r) => ({
      adminId: r.adminId,
      type: r.type,
      employeeId: r.employeeId,
      message: r.message,
      dueDate: r.dueDate ?? null,
      offsetDays: r.offsetDays ?? null,
      actorAdminId: r.actorAdminId ?? null,
    })))
    .onConflictDoNothing()
    .returning({
      adminId: schema.notifications.adminId,
      type: schema.notifications.type,
      employeeId: schema.notifications.employeeId,
      message: schema.notifications.message,
      offsetDays: schema.notifications.offsetDays,
    });

  // Um envio por conteúdo, com todos os destinatários dele — e não um por
  // linha, que abriria N conexões para o mesmo texto.
  const grupos = new Map<string, { row: (typeof inserted)[number]; adminIds: string[] }>();
  for (const row of inserted) {
    const chave = [row.type, row.employeeId, row.offsetDays, row.message].join('|');
    const grupo = grupos.get(chave) ?? { row, adminIds: [] };
    grupo.adminIds.push(row.adminId);
    grupos.set(chave, grupo);
  }

  for (const { row, adminIds } of grupos.values()) {
    const r = await sendPushToAdmins(adminIds, (portal) => notificationPayload({
      type: row.type,
      employeeId: row.employeeId,
      message: row.message,
      offsetDays: row.offsetDays,
      portal,
    })).catch(() => ({ enviados: 0, removidos: 0, falhas: adminIds.length }));
    push.enviados += r.enviados;
    push.removidos += r.removidos;
    push.falhas += r.falhas;
  }

  return { avisos: inserted.length, repetidos: rows.length - inserted.length, push };
}

/**
 * Avisa quem acompanha que algo acabou de acontecer.
 *
 * Chamado DEPOIS de a operação principal ter dado certo, e nunca a derruba:
 * como o `logAudit`, qualquer falha aqui é registrada e engolida — a
 * avaliação que o gestor acabou de salvar não pode voltar com erro porque o
 * serviço de push do celular de outra pessoa estava fora do ar.
 */
export async function notifyActivity(event: ActivityEvent, actorAdminId: string | null): Promise<void> {
  try {
    const admins = await loadNotifiableAdmins();
    const targets = activityTargets(admins, event, actorAdminId);
    if (targets.length === 0) return;

    const actorName = admins.find((a) => a.id === actorAdminId)?.name ?? '';
    const message = activityMessage(event, actorName);
    const employeeId = activityEmployeeId(event);

    await deliverNotifications(targets.map((admin) => ({
      adminId: admin.id,
      type: event.type,
      employeeId,
      message,
      actorAdminId,
    })));
  } catch (err) {
    console.error('Falha ao enviar aviso de movimentação:', err);
  }
}
