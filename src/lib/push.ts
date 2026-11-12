import webpush from 'web-push';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
import type { PushPayload } from './pushPayload';

/**
 * Envio de aviso no celular (Web Push), sem serviço pago.
 *
 * O caminho é o padrão do navegador: cada aparelho se inscreve e devolve um
 * `endpoint` do serviço de push do próprio fabricante (Google, Apple,
 * Mozilla). O servidor assina cada envio com o par de chaves VAPID e
 * criptografa a mensagem com as chaves do aparelho. Não há intermediário
 * nosso, nem custo.
 *
 * O módulo é tolerante à ausência de configuração: sem as chaves VAPID, o
 * envio simplesmente não acontece e a rotina de avisos segue gravando o sino
 * normalmente. Push é um reforço do aviso, nunca o único canal.
 */

let configurado: boolean | null = null;

/** As chaves VAPID estão configuradas? Calculado uma vez por processo. */
export function isPushConfigured(): boolean {
  if (configurado !== null) return configurado;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configurado = false;
    return configurado;
  }
  // O "subject" identifica quem envia para o serviço de push; precisa ser uma
  // URL ou um mailto. Sem ele, os serviços recusam a assinatura.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:rh@restaurantespot.com.br', publicKey, privateKey);
  configurado = true;
  return configurado;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushResult {
  enviados: number;
  removidos: number;
  falhas: number;
}

/**
 * Envia um aviso para todos os aparelhos inscritos destes usuários.
 *
 * Inscrição que o serviço de push rejeita com 404/410 está morta (app
 * desinstalado, permissão revogada, aparelho trocado) e é apagada na hora —
 * sem isso a tabela vira um cemitério que faz a rotina diária ficar mais lenta
 * a cada mês.
 */
export async function sendPushToAdmins(
  adminIds: string[],
  /**
   * O conteúdo, ou uma função que o monta por aparelho: o link do toque
   * depende do portal em que aquele navegador foi inscrito.
   */
  payload: PushPayload | ((portal: 'admin' | 'gestor') => PushPayload),
): Promise<PushResult> {
  const vazio: PushResult = { enviados: 0, removidos: 0, falhas: 0 };
  if (!isPushConfigured() || adminIds.length === 0) return vazio;

  const subs = await db.query.pushSubscriptions.findMany({
    where: inArray(schema.pushSubscriptions.adminId, adminIds),
  });
  if (subs.length === 0) return vazio;

  const corpoPara = (portal: 'admin' | 'gestor') =>
    JSON.stringify(typeof payload === 'function' ? payload(portal) : payload);
  const mortas: string[] = [];
  const entregues: string[] = [];
  let falhas = 0;

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        corpoPara(sub.portal),
        // 24h: um lembrete de prazo não tem valor depois que o dia passou.
        // `urgency: high` pede ao Android que entregue na hora mesmo com o
        // aparelho em economia de bateria — sem isso o aviso pode chegar
        // horas depois, quando o celular "acorda".
        { TTL: 60 * 60 * 24, urgency: 'high' },
      );
      entregues.push(sub.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) mortas.push(sub.id);
      else falhas += 1;
    }
  }));

  if (mortas.length > 0) {
    await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, mortas));
  }
  if (entregues.length > 0) {
    await db
      .update(schema.pushSubscriptions)
      .set({ lastSuccessAt: new Date() })
      .where(inArray(schema.pushSubscriptions.id, entregues));
  }

  return { enviados: entregues.length, removidos: mortas.length, falhas };
}

/**
 * Registra (ou atualiza) a inscrição de um navegador.
 *
 * A chave é o `endpoint`: se o mesmo aparelho reinscrever — depois de limpar
 * dados, ou porque outra pessoa entrou nele —, a linha existente passa a
 * apontar para o usuário atual em vez de duplicar e mandar aviso para o dono
 * anterior.
 */
export async function saveSubscription({
  adminId, portal, endpoint, p256dh, auth, userAgent,
}: {
  adminId: string;
  portal: 'admin' | 'gestor';
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}) {
  const [row] = await db
    .insert(schema.pushSubscriptions)
    .values({ adminId, portal, endpoint, p256dh, auth, userAgent })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { adminId, portal, p256dh, auth, userAgent },
    })
    .returning();

  // Teto por pessoa: cada aviso dispara uma requisição por inscrição, e sem
  // limite alguém podia cadastrar centenas de endpoints falsos (em hosts
  // permitidos) e multiplicar o trabalho de toda entrega. Ficam as mais novas.
  const minhas = await db.query.pushSubscriptions.findMany({
    where: eq(schema.pushSubscriptions.adminId, adminId),
    columns: { id: true },
    orderBy: desc(schema.pushSubscriptions.createdAt),
  });
  const excedentes = minhas.slice(MAX_SUBSCRIPTIONS_PER_ADMIN).map((s) => s.id);
  if (excedentes.length > 0) {
    await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, excedentes));
  }
  return row;
}

const MAX_SUBSCRIPTIONS_PER_ADMIN = 10;

/** Remove a inscrição deste navegador. Só apaga a do próprio usuário. */
export async function removeSubscription(adminId: string, endpoint: string) {
  const sub = await db.query.pushSubscriptions.findFirst({
    where: eq(schema.pushSubscriptions.endpoint, endpoint),
    columns: { id: true, adminId: true },
  });
  if (!sub || sub.adminId !== adminId) return false;
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
  return true;
}

/** Quantos aparelhos este usuário tem inscritos — usado pela tela para saber o estado. */
export async function countSubscriptions(adminId: string): Promise<number> {
  const rows = await db.query.pushSubscriptions.findMany({
    where: eq(schema.pushSubscriptions.adminId, adminId),
    columns: { id: true },
  });
  return rows.length;
}
