import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from './apiAuth';
import { pushSubscriptionSchema, pushUnsubscribeSchema } from './validation';
import {
  isPushConfigured, vapidPublicKey, saveSubscription, removeSubscription, countSubscriptions,
} from './push';

/**
 * As três operações de Web Push, iguais nos dois portais.
 *
 * O que muda entre `/api/admin/push` e `/api/gestor/push` é só de quem é a
 * sessão (cookies separados por portal) e para onde o toque na notificação
 * leva. A lógica em si mora aqui para não existirem duas versões que se
 * desencontrem na primeira manutenção.
 */

/** Estado do push para quem está logado: a tela decide o que mostrar com isto. */
export async function pushStatus(adminId: string) {
  return NextResponse.json({
    /** Sem chaves VAPID no servidor, a tela nem oferece a opção. */
    enabled: isPushConfigured(),
    publicKey: vapidPublicKey(),
    devices: await countSubscriptions(adminId),
  });
}

export async function pushSubscribe(req: NextRequest, adminId: string, portal: 'admin' | 'gestor') {
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Avisos no celular não estão configurados neste servidor.' }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Inscrição inválida.' }, { status: 400 });
  }

  await saveSubscription({
    adminId,
    portal,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    // Só para a pessoa reconhecer o aparelho; cortado para não virar um campo
    // de texto livre de tamanho arbitrário vindo do cliente.
    userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  });

  return NextResponse.json({ ok: true, devices: await countSubscriptions(adminId) });
}

export async function pushUnsubscribe(req: NextRequest, adminId: string) {
  const body = await req.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Inscrição inválida.' }, { status: 400 });
  }
  await removeSubscription(adminId, parsed.data.endpoint);
  return NextResponse.json({ ok: true, devices: await countSubscriptions(adminId) });
}

export { handleApiError };
