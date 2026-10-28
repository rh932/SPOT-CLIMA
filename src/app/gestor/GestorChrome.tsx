'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SpotBrand } from '@/components/theme/SpotBrand';
import { NotificationBell } from '@/components/NotificationBell';
import { PushPrompt } from '@/components/PushPrompt';

import { useMyPermissions } from './useMyPermissions';
import { activeNavHref, logoutAndLeave } from '@/lib/nav';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Menu do portal da operação. Gestor, Gestor Líder e Treinador entram pela
 * mesma porta; cada item só aparece para quem tem a permissão dele — o Gestor
 * não vê treinamento, o Treinador não vê avaliações, e o Líder vê os dois.
 *
 * Isto é só a interface: quem forçar a URL de uma área que não é sua esbarra
 * na checagem de permissão do backend.
 */
/**
 * `short` é o rótulo da faixa de abas do celular. Os nomes completos
 * ("Avaliação de Experiência", "Histórico de treinamentos") ocupavam quase a
 * tela inteira num telefone: cabia uma aba e meia, e o resto da navegação
 * ficava escondido atrás de um arrastar que ninguém adivinha.
 */
/*
 * Os glifos decorativos saíram (eram '★', '≡', '▦', '◉', '🎓', '▤'). Já
 * precisavam de aria-hidden para não serem lidos em voz alta, não ajudavam a
 * distinguir um item do outro — e na faixa de abas do celular roubavam largura
 * do único elemento que informa, que é o rótulo.
 */
const NAV: { href: string; label: string; short: string; permission: PermissionKey }[] = [
  { href: '/gestor', label: 'Avaliação de Experiência', short: 'Experiência', permission: 'evaluations.view' },
  { href: '/gestor/feedback', label: 'Feedback', short: 'Feedback', permission: 'evaluations.view' },
  { href: '/gestor/pendencias', label: 'Pendências', short: 'Pendências', permission: 'evaluations.view' },
  { href: '/gestor/proximas', label: 'Próximas avaliações', short: 'Próximas', permission: 'evaluations.view' },
  { href: '/gestor/treinamento', label: 'Treinamento', short: 'Treinar', permission: 'trainings.view' },
  { href: '/gestor/historico', label: 'Histórico de avaliações', short: 'Histórico', permission: 'evaluations.history.view' },
  { href: '/gestor/treinamento/historico', label: 'Histórico de treinamentos', short: 'Treinos feitos', permission: 'trainings.history.view' },
];

export function GestorChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [gestorName, setGestorName] = useState<string | null>(null);
  const { can, loading: loadingPerms, expired, failed } = useMyPermissions();

  useEffect(() => {
    if (pathname === '/gestor/login') return;
    // Sem `catch`, uma queda de rede aqui virava rejeição não tratada no
    // console. O nome é enfeite do cabeçalho: se não vier, a tela segue.
    fetch('/api/auth/me?portal=gestor')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGestorName(d?.admin?.name ?? null))
      .catch(() => setGestorName(null));
  }, [pathname]);

  // Sessão de 8h expirada com a página aberta: o middleware não tem como agir
  // (não houve navegação), então é a tela que manda de volta ao login em vez de
  // deixar o gestor num painel sem menu.
  useEffect(() => {
    if (expired && pathname !== '/gestor/login') {
      const next = encodeURIComponent(pathname ?? '/gestor');
      router.replace(`/gestor/login?next=${next}`);
    }
  }, [expired, pathname, router]);

  if (pathname === '/gestor/login') return <>{children}</>;

  // Enquanto as permissões não chegam, não mostro item nenhum — melhor um
  // menu vazio por um instante do que piscar opções que somem em seguida.
  const visibleNav = loadingPerms ? [] : NAV.filter((item) => can(item.permission));

  /** Estado do menu quando não há itens para mostrar — nunca uma lista muda. */
  const navFallback = (className: string) => {
    if (loadingPerms) return <p className={className}>Carregando menu...</p>;
    if (expired) return <p className={className}>Sessão expirada. Redirecionando para o login...</p>;
    if (failed) {
      return (
        <button type="button" onClick={() => window.location.reload()} className={`${className} text-left underline`}>
          Não foi possível carregar o menu. Tentar de novo.
        </button>
      );
    }
    return <p className={className}>Nenhuma área liberada para o seu acesso.</p>;
  };

  const logout = () => logoutAndLeave('gestor');

  // Vence o item mais específico — ver activeNavHref(). Com `startsWith` puro,
  // "Treinamento" e "Histórico de treinamentos" acendiam juntos.
  const ativo = activeNavHref(pathname, visibleNav.map((i) => i.href));

  return (
    <div className="min-h-dvh flex flex-col bg-spot-cream">
      <a href="#conteudo" className="pular-conteudo print:hidden">Pular para o conteúdo</a>
      <header className="bg-spot-sidebar text-spot-sidebarText flex items-center justify-between px-4 sm:px-6 h-14 shrink-0 print:hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0"><SpotBrand size="sm" layout="row" /></span>
          {/* spot-gray-400 aqui é proposital: sobre o fundo escuro da barra ele dá
              7.13:1, enquanto o gray-500 usado no resto do app cairia para
              3.89:1. A troca de contraste do restante das telas não vale aqui. */}
          <p className="text-[11px] text-spot-sidebarText/65 leading-tight min-w-0 truncate hidden sm:block">Avaliações e Treinamentos</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Só quem recebe aviso vê o sino — o backend recusa a rota para os demais. */}
          {!loadingPerms && can('notifications.receive') && <NotificationBell portal="gestor" />}
          <span className="text-xs text-spot-sidebarText/75 hidden sm:inline truncate max-w-[12rem]">{gestorName}</span>
          {/*
            `lg:hidden`: no desktop a barra lateral ja tem "Sair da conta", e os
            dois apareciam juntos — dois controles com o mesmo nome fazendo a
            mesma coisa, o que na navegacao por lista de botoes soa como uma
            escolha que nao existe. No celular nao ha barra lateral, entao este
            aqui e o unico.
            px-3/min-w-11: media 36px de largura, e alvo de toque conta nas duas
            dimensoes.
          */}
          <button
            onClick={logout}
            aria-label="Sair da conta"
            className="lg:hidden inline-flex items-center justify-center min-h-11 min-w-11 px-3 -mr-2 text-xs text-spot-sidebarText/75 hover:text-white transition"
          >
            Sair
          </button>
        </div>
      </header>

      {/*
        No celular a navegação fica SEMPRE visível, como uma faixa de abas que
        rola na horizontal — o gestor usa o painel quase todo pelo telefone, e
        um menu escondido atrás de um botão já deixou a tela sem navegação.
      */}
      <nav
        aria-label="Seções do painel"
        className="lg:hidden bg-spot-sidebar text-spot-sidebarText px-2 flex gap-1 overflow-x-auto print:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleNav.length === 0 && navFallback('px-3 py-2.5 text-xs text-spot-sidebarText/75 whitespace-nowrap')}
        {visibleNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo === item.href ? 'page' : undefined}
            /* min-h-11 = 44px, o mínimo confortável para o dedo.
               A aba ativa é marcada por um traço amarelo embaixo, não por uma
               pílula amarela preenchida: eram seis pastilhas disputando
               atenção numa faixa de 360px, e a cheia parecia um botão a
               apertar em vez do lugar onde a pessoa já está. */
            className={`flex items-center min-h-11 border-b-2 px-3 text-xs whitespace-nowrap shrink-0 transition-colors ${
              ativo === item.href
                ? 'border-spot-accent text-white font-semibold'
                : 'border-transparent text-spot-sidebarText/75 font-normal hover:text-white'
            }`}
          >
            <span className="sm:hidden">{item.short}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex-1 flex min-h-0">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-spot-sidebar text-spot-sidebarText print:hidden">
          <nav className="flex-1 py-4 flex flex-col">
            {visibleNav.length === 0 && navFallback('px-3 py-2.5 text-sm text-spot-sidebarText/75')}
            {visibleNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo === item.href ? 'page' : undefined}
                className={`flex items-center min-h-11 border-l-2 pl-4 pr-3 text-sm transition-colors ${
                  ativo === item.href
                    ? 'border-spot-accent bg-white/[0.07] text-white font-semibold'
                    : 'border-transparent text-spot-sidebarText/75 font-normal hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-white/10">
            <p className="font-mono text-[11px] text-spot-sidebarText/65 truncate mb-1">{gestorName}</p>
            <button
              onClick={logout}
              className="inline-flex items-center min-h-11 px-2 -ml-2 text-xs text-spot-sidebarText/75 hover:text-white transition"
            >
              Sair da conta
            </button>
          </div>
        </aside>

        <main id="conteudo" tabIndex={-1} className="flex-1 min-w-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
            {!loadingPerms && can('notifications.receive') && <PushPrompt portal="gestor" />}
            <div key={pathname} className="animate-fadeIn">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
