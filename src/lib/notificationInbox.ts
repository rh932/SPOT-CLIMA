import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

/**
 * Caixa de avisos de quem está logado — igual nos dois portais. O que muda
 * entre /api/admin/notifications e /api/gestor/notifications é só de quem é
 * a sessão.
 */

const RECENT_LIMIT = 30;

export async function listInbox(adminId: string) {
  const [rows, naoLidas] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(schema.notifications.adminId, adminId),
      orderBy: desc(schema.notifications.createdAt),
      limit: RECENT_LIMIT,
      columns: { id: true, type: true, message: true, dueDate: true, offsetDays: true, readAt: true, createdAt: true },
      with: {
        employee: { columns: { id: true, fullName: true } },
        actor: { columns: { name: true } },
      },
    }),
    // Contado à parte: com mais de 30 avisos, o número do sino não pode parar
    // em 30 só porque a lista mostra os 30 mais recentes.
    db.query.notifications.findMany({
      where: and(eq(schema.notifications.adminId, adminId), isNull(schema.notifications.readAt)),
      columns: { id: true },
    }),
  ]);
  return { notifications: rows, unread: naoLidas.length };
}

/**
 * Marca avisos como lidos. Sem `ids`, marca todos os do usuário; com `ids`,
 * só os informados. O filtro por `adminId` é o que impede alguém de marcar
 * como lido o aviso de outra pessoa mandando ids na mão.
 */
export async function markInboxRead(adminId: string, body: unknown) {
  const raw = (body as { ids?: unknown } | null)?.ids;
  // Teto: um array enorme ia direto para o IN e estourava o limite de
  // parâmetros do Postgres (500 é muito mais que a lista de 30 do sino).
  const ids = Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, 500)
    : null;
  if (Array.isArray(raw) && ids!.length === 0) return 0;

  const updated = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(schema.notifications.adminId, adminId),
      isNull(schema.notifications.readAt),
      ids && ids.length > 0 ? inArray(schema.notifications.id, ids) : undefined,
    ))
    .returning({ id: schema.notifications.id });

  return updated.length;
}
