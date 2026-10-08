'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Estado do aviso no celular (Web Push) para ESTE aparelho, e as ações de
 * ligar e desligar. Usado pelo interruptor do sino e pelo convite no topo da
 * tela — os dois precisam concordar sobre o estado, então a lógica é uma só.
 *
 * A inscrição é por aparelho, não por conta: quem usa o celular e o
 * computador precisa ligar nos dois.
 */

export type PushEstado =
  | 'carregando'
  /** Navegador sem suporte a push (ex.: navegador antigo). */
  | 'indisponivel'
  /** iPhone/iPad fora da tela de início — o Safari só entrega push para app instalado. */
  | 'instalar'
  /** Servidor sem chaves VAPID configuradas. */
  | 'desconfigurado'
  /** A pessoa bloqueou a permissão no navegador; só ela pode desfazer. */
  | 'bloqueado'
  | 'desligado'
  | 'ligado';

/** Avisa as outras instâncias (sino × convite) de que o estado mudou. */
const EVENTO = 'spot-push-mudou';

/**
 * A chave VAPID vem em base64url e o navegador exige bytes.
 * `atob` não entende `-` e `_`, por isso a tradução antes.
 */
function base64UrlParaBytes(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function ehIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPad moderno se apresenta como Mac; os pontos de toque o entregam.
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function instaladoNaTelaDeInicio(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function usePush(portal: 'admin' | 'gestor') {
  const [estado, setEstado] = useState<PushEstado>('carregando');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const suportado = typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;

    if (!suportado) {
      // No iPhone o suporte só existe depois de instalar na tela de início —
      // a orientação é diferente de "seu navegador não suporta".
      setEstado(ehIOS() && !instaladoNaTelaDeInicio() ? 'instalar' : 'indisponivel');
      return;
    }

    const res = await fetch(`/api/${portal}/push`).catch(() => null);
    if (!res?.ok) { setEstado('indisponivel'); return; }
    const data = await res.json();
    if (!data.enabled || !data.publicKey) { setEstado('desconfigurado'); return; }
    setPublicKey(data.publicKey);

    if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }

    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setEstado(sub ? 'ligado' : 'desligado');
  }, [portal]);

  useEffect(() => {
    const recarregar = () => { carregar().catch(() => setEstado('indisponivel')); };
    recarregar();
    window.addEventListener(EVENTO, recarregar);
    return () => window.removeEventListener(EVENTO, recarregar);
  }, [carregar]);

  const avisarOutros = () => window.dispatchEvent(new Event(EVENTO));

  const ligar = async () => {
    if (!publicKey) return;
    setOcupado(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado');
        return;
      }

      // `userVisibleOnly` é obrigatório nos navegadores atuais: todo push
      // recebido precisa virar uma notificação visível.
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaBytes(publicKey),
      });

      const res = await fetch(`/api/${portal}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        // Se o servidor não guardou, a inscrição local não serve para nada —
        // desfazer evita o aparelho ficar "ligado" sem receber nada.
        await sub.unsubscribe().catch(() => {});
        throw new Error((await res.json().catch(() => ({}))).error ?? 'Não foi possível ativar.');
      }
      setEstado('ligado');
      avisarOutros();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ativar os avisos.');
    } finally {
      setOcupado(false);
    }
  };

  const desligar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/${portal}/push`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado('desligado');
      avisarOutros();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desativar.');
    } finally {
      setOcupado(false);
    }
  };

  return { estado, ocupado, erro, ligar, desligar };
}
