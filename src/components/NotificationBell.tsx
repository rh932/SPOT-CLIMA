'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { COLOR_OPTIONS, type FeedbackColor } from '@/lib/feedbackCycle';
import { notificationUrl, type NotificationType } from '@/lib/pushPayload';
import { PushToggle } from './PushToggle';
import { Skeleton, Spinner } from './async';

interface InboxItem {
  id: string;
  type: NotificationType;
  message: string;
  dueDate: string | null;
  offsetDays: number | null;
  readAt: string | null;
  createdAt: string;
  employee: { id: string; fullName: string } | null;
  actor: { name: string } | null;
}

interface DueItem {
  id: string;
  fullName: string;
  currentColor: FeedbackColor | null;
  nextFeedbackDueDate: string;
  dias: number;
  status: string | null;
  sector: { name: string } | null;
  unit: { name: string } | null;
}

/** De quanto em quanto tempo o sino se atualiza sozinho com a aba visível. */
const REFRESH_MS = 60_000;

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" — ou a data, depois de uma semana. */
function quando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

/**
 * Sino de avisos, nos dois portais.
 *
 * - "Avisos": a caixa de quem está logado — lembretes de prazo (gestor) e
 *   movimentações da equipe (todos), com contador de não lidos;
 * - "A vencer" (só no admin): a situação do ciclo de feedback agora,
 *   calculada na hora — o RH acompanha o prazo, não recebe um lembrete por
 *   colaborador.
 *
 * Ele se atualiza sozinho: quando chega um push com o sistema aberto (o
 * service worker avisa a página), quando a pessoa volta para a aba e a cada
 * minuto enquanto ela está visível.
 */
export function NotificationBell({
  portal, placement = 'below',
}: {
  portal: 'admin' | 'gestor';
  /** `below` abre para baixo (barra superior); `above` para cima (rodapé da sidebar). */
  placement?: 'below' | 'above';
}) {
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<'avisos' | 'vencer'>('avisos');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [erro, setErro] = useState(false);
  const [recarregando, setRecarregando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [erroMarcar, setErroMarcar] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sinoRef = useRef<HTMLButtonElement>(null);
  const url = `/api/${portal}/notifications`;

  /**
   * Busca os avisos. `silencioso` é a atualização automática: não troca a
   * lista por esqueleto nem acende erro por cima do que já está na tela —
   * uma falha de rede passageira não pode apagar os avisos que a pessoa lia.
   *
   * Na busca normal, a falha aparece: "Nenhum aviso" precisa significar que
   * não há aviso, não que a rota caiu.
   */
  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) { setRecarregando(true); setErro(false); }
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { if (!silencioso) setErro(true); return; }
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
      if (portal === 'admin') setDueItems(data.items ?? []);
      setErro(false);
    } catch {
      if (!silencioso) setErro(true);
    } finally {
      setLoaded(true);
      if (!silencioso) setRecarregando(false);
    }
  }, [portal, url]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const atualizar = () => { if (document.visibilityState === 'visible') load(true); };
    const timer = window.setInterval(atualizar, REFRESH_MS);
    document.addEventListener('visibilitychange', atualizar);
    // O sw.js manda { type: 'push' } para as janelas abertas quando um aviso
    // chega: o número do sino sobe junto com a notificação do celular.
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'push') load(true); };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', atualizar);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [load]);

  // Fecha ao tocar/clicar fora ou com Esc — o painel é um popover, não uma
  // página. `pointerdown` cobre dedo e mouse com um listener só.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Copiado para uma variavel do efeito: no cleanup o ref ja pode apontar
    // para outro no (ou nenhum).
    const sino = sinoRef.current;
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      // Ao fechar, o foco volta para o sino. Sem isto ele caia no <body> e a
      // tabulacao recomecava do topo da pagina — num painel com 16 itens de
      // menu antes do sino, e um caminho longo de volta.
      if (sino?.isConnected) sino.focus();
    };
  }, [open]);

  const markAllRead = async () => {
    if (marcando) return;
    setMarcando(true);
    setErroMarcar(null);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => null);
    setMarcando(false);
    // Só zera na tela se o servidor confirmou — senão o contador sumiria e os
    // avisos voltariam no próximo carregamento, sem explicação.
    if (!res?.ok) {
      setErroMarcar('Não foi possível marcar como lidas. Tente de novo.');
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  };

  /**
   * Abrir um aviso o marca como lido. `keepalive` porque o toque também
   * navega: sem ele, a troca de página podia cancelar a requisição no meio.
   */
  const abrir = (n: InboxItem) => {
    setOpen(false);
    if (n.readAt) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread((c) => Math.max(0, c - 1));
    fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [n.id] }),
      keepalive: true,
    }).catch(() => {});
  };

  // Enquanto não carregou, nada de sino piscando na tela.
  if (!loaded) return null;

  const mostraVencer = portal === 'admin' && aba === 'vencer';

  const listaAvisos = items.length === 0 ? (
    <p className="px-4 py-6 text-sm text-spot-gray-500 text-center">Nenhum aviso por enquanto.</p>
  ) : (
    items.map((n) => {
      const lembrete = n.dueDate !== null;
      return (
        <Link
          key={n.id}
          href={notificationUrl(n.type, n.employee?.id ?? null, portal)}
          onClick={() => abrir(n)}
          className={`block px-4 py-3 border-b border-spot-gray-100 last:border-0 hover:bg-spot-gray-100 transition ${n.readAt ? '' : 'bg-spot-gray-50 border-l-[3px] border-l-spot-yellow'}`}
        >
          {!n.readAt && <span className="sr-only">Não lido: </span>}
          <span className={`block text-sm leading-snug ${n.readAt ? '' : 'font-medium'}`}>{n.message}</span>
          <span className="block text-xs text-spot-gray-500 mt-1">
            {lembrete ? `Previsto para ${formatDate(n.dueDate!)}` : quando(n.createdAt)}
          </span>
        </Link>
      );
    })
  );

  const listaVencer = dueItems.length === 0 ? (
    <p className="px-4 py-6 text-sm text-spot-gray-500 text-center">Nenhum feedback vencendo nos próximos 7 dias.</p>
  ) : (
    dueItems.map((item) => {
      const colorOption = item.currentColor ? COLOR_OPTIONS.find((c) => c.value === item.currentColor) : null;
      return (
        <Link
          key={item.id}
          href={`/admin/employees/${item.id}`}
          onClick={() => setOpen(false)}
          className="block px-4 py-3 border-b border-spot-gray-100 last:border-0 hover:bg-spot-gray-50 transition"
        >
          <p className="text-sm font-medium flex items-center gap-1.5">
            {colorOption && <span className={`h-2 w-2 rounded-full ${colorOption.dotClassName}`} />}
            {item.fullName}
          </p>
          <p className="text-xs text-spot-gray-500">{item.sector?.name} · {item.unit?.name}</p>
          <p className={`text-xs mt-0.5 ${item.dias < 0 ? 'text-spot-danger' : 'text-spot-gray-500'}`}>
            {item.dias < 0
              ? `Atrasado há ${Math.abs(item.dias)} ${Math.abs(item.dias) === 1 ? 'dia' : 'dias'}`
              : item.dias === 0
                ? 'Vence hoje'
                : `Vence em ${item.dias} ${item.dias === 1 ? 'dia' : 'dias'}`}
            {' · '}{formatDate(item.nextFeedbackDueDate)}
          </p>
        </Link>
      );
    })
  );

  const abaClasse = (ativa: boolean) => `min-h-11 px-1 text-sm transition border-b-2 ${
    ativa ? 'font-bold border-spot-black text-spot-black' : 'border-transparent text-spot-gray-500 hover:text-spot-black'
  }`;

  return (
    <div className="relative" ref={boxRef}>
      <button
        ref={sinoRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        /* h-11/w-11: o sino era só o emoji, um alvo de ~16px no celular. */
        className="relative h-11 w-11 -mx-2 flex items-center justify-center text-spot-sidebarText/75 hover:text-white transition text-base leading-none"
        aria-label={unread > 0 ? `Avisos (${unread} não lidos)` : 'Avisos'}
        aria-expanded={open}
      >
        {/* SVG inline em currentColor, nao o emoji 🔔: o emoji e desenhado
            pelo SISTEMA, entao o sino tinha cara diferente em cada aparelho
            e nao herdava a cor do tema. */}
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M18 8.4A6 6 0 0 0 6 8.4c0 4.2-1.5 5.4-2.1 6.1a.7.7 0 0 0 .5 1.2h15.2a.7.7 0 0 0 .5-1.2c-.6-.7-2.1-1.9-2.1-6.1Z" />
          <path d="M10.3 19.2a2 2 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 bg-spot-accent text-spot-onYellow text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute w-80 max-w-[calc(100vw-2rem)] bg-spot-white text-spot-black rounded-xl2 shadow-lg border border-spot-gray-200 z-50 animate-fadeIn overflow-hidden ${placement === 'above' ? 'left-0 bottom-8' : 'right-0 top-8'}`}>
          <div className="flex items-center justify-between gap-3 px-4 border-b border-spot-gray-100">
            {portal === 'admin' ? (
              <div className="flex items-center gap-4" role="tablist" aria-label="Tipo de aviso">
                <button type="button" role="tab" aria-selected={aba === 'avisos'} onClick={() => setAba('avisos')} className={abaClasse(aba === 'avisos')}>
                  Avisos{unread > 0 ? ` (${unread})` : ''}
                </button>
                <button type="button" role="tab" aria-selected={aba === 'vencer'} onClick={() => setAba('vencer')} className={abaClasse(aba === 'vencer')}>
                  A vencer{dueItems.length > 0 ? ` (${dueItems.length})` : ''}
                </button>
              </div>
            ) : (
              <p className="text-sm font-bold py-3">Avisos</p>
            )}
            {!mostraVencer && unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={marcando}
                aria-busy={marcando || undefined}
                className="text-xs text-spot-gray-500 hover:text-spot-black transition flex items-center gap-1.5 disabled:opacity-60 min-h-11 shrink-0"
              >
                {marcando && <Spinner className="h-3 w-3" />}
                {marcando ? 'Marcando...' : 'Marcar como lidas'}
              </button>
            )}
          </div>
          {erroMarcar && (
            <p role="alert" className="px-4 py-2 text-xs text-spot-danger border-l-[3px] border-spot-danger">{erroMarcar}</p>
          )}

          <div className="max-h-80 overflow-y-auto">
            {/* Falha antes de vazio: "nenhum aviso" precisa significar que
                não há aviso, não que a busca falhou. */}
            {erro ? (
              <div role="alert" className="px-4 py-5 text-center flex flex-col items-center gap-2">
                <p className="text-sm text-spot-danger">Não foi possível buscar os avisos.</p>
                <button
                  type="button"
                  onClick={() => load()}
                  disabled={recarregando}
                  className="text-xs underline text-spot-gray-600 hover:text-spot-black disabled:opacity-60"
                >
                  {recarregando ? 'Tentando...' : 'Tentar de novo'}
                </button>
              </div>
            ) : recarregando ? (
              <div aria-hidden className="px-4 py-3 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                ))}
              </div>
            ) : mostraVencer ? listaVencer : listaAvisos}
          </div>

          {/* Interruptor do aviso no celular. Fica no rodapé do sino porque é
              aqui que a pessoa está quando pensa em notificação. */}
          <PushToggle portal={portal} />
        </div>
      )}
    </div>
  );
}
