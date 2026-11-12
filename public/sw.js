/*
 * Service worker do Spot Integra.
 *
 * Faz UMA coisa: receber e mostrar aviso de push. Não guarda página em cache
 * nem tenta funcionar offline — o sistema depende do banco a cada tela, e um
 * cache mal calibrado mostraria prazo de avaliação vencido como se fosse
 * atual. Se um dia houver modo offline, ele entra aqui de propósito, não por
 * acidente.
 *
 * Os campos lidos de `data` são o contrato com src/lib/pushPayload.ts.
 */

// Assume o controle assim que instala, sem esperar a aba antiga fechar —
// senão a primeira ativação só valeria na próxima vez que a pessoa abrisse o
// sistema, e o aviso ficaria sem receber até lá.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Push sem corpo legível (teste do próprio navegador, versão antiga do
    // servidor): ainda assim mostramos algo, porque em muitos navegadores um
    // push recebido e não exibido faz a permissão ser revogada.
    payload = {};
  }

  const title = payload.title || 'Spot Integra';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: payload.body || 'Você tem um aviso no Spot Integra.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // `tag` igual substitui o aviso anterior do mesmo assunto em vez de
      // empilhar três lembretes do mesmo colaborador na tela do celular.
      tag: payload.tag || 'spot-clima',
      renotify: Boolean(payload.tag),
      // Vibração curta: no salão, com barulho, o toque sozinho passa batido.
      vibrate: [120, 60, 120],
      data: { url: payload.url || '/' },
    });
    // Quem está com o sistema aberto vê o número do sino subir na hora, sem
    // esperar a próxima atualização (NotificationBell escuta esta mensagem).
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'push' });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const url = new URL(destino, self.location.origin);
    // Mesma origem, sempre: o destino vem do nosso servidor, mas resolver
    // contra a origem impede que um valor inesperado abra um site de fora.
    if (url.origin !== self.location.origin) return;

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reaproveita uma janela já aberta do sistema em vez de abrir outra —
    // quem está com o painel aberto no celular não quer uma segunda aba.
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url.href);
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
