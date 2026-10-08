'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SpotBrand } from '@/components/theme/SpotBrand';
import { NotificationBell } from '@/components/NotificationBell';
import { PushPrompt } from '@/components/PushPrompt';
import { activeNavHref, logoutAndLeave } from '@/lib/nav';
import { usePainelModal } from '@/components/forms/usePainelModal';

/**
 * O menu do admin tem 16 destinos. Numa lista corrida, com um glifo decorativo
 * na frente de cada um, ninguém encontra nada: o olho varre 16 linhas iguais.
 *
 * Duas mudanças resolvem isso sem tirar nenhum destino:
 *   - os itens foram agrupados pelo assunto de quem procura (a pesquisa em si,
 *     as pessoas, o cadastro que sustenta os dois, o sistema);
 *   - os ícones saíram. Eram glifos Unicode escolhidos um a um ("◧", "▥", "▤"
 *     duas vezes) que não diziam nada e já precisavam de aria-hidden para não
 *     poluir o leitor de tela. Sem eles, o rótulo — que é a informação — passa
 *     a começar todo no mesmo lugar.
 */
const GRUPOS = [
  {
    titulo: 'Pesquisa',
    itens: [
      { href: '/admin', label: 'Visão Geral' },
      { href: '/admin/surveys', label: 'Pesquisas' },
      { href: '/admin/templates', label: 'Modelos' },
      { href: '/admin/results', label: 'Resultados' },
      { href: '/admin/comments', label: 'Comentários' },
      { href: '/admin/comparisons', label: 'Comparativos' },
      { href: '/admin/reports', label: 'Relatórios' },
    ],
  },
  {
    titulo: 'Pessoas',
    itens: [
      { href: '/admin/employees', label: 'Avaliação de Experiência' },
      { href: '/admin/evaluations', label: 'Histórico de Avaliações' },
      { href: '/admin/trainings', label: 'Treinamentos' },
      { href: '/admin/trainings/report', label: 'Relatório de Treinamentos' },
      { href: '/admin/action-plans', label: 'Plano de Ação' },
    ],
  },
  {
    titulo: 'Cadastro',
    itens: [
      { href: '/admin/sectors', label: 'Setores' },
      { href: '/admin/units', label: 'Unidades' },
      { href: '/admin/dimensions', label: 'Dimensões' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { href: '/admin/users', label: 'Usuários' },
      { href: '/admin/settings', label: 'Configurações' },
    ],
  },
];

const TODOS_OS_HREFS = GRUPOS.flatMap((g) => g.itens.map((i) => i.href));

/**
 * Item do menu. O ativo é marcado por uma barra amarela na lateral e pelo peso
 * do texto — e não por uma pílula amarela preenchida, que virava o objeto mais
 * chamativo da tela inteira e competia com o conteúdo.
 */
function ItemMenu({
  href,
  label,
  ativo,
  onClick,
}: {
  href: string;
  label: string;
  ativo: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      className={`flex items-center min-h-11 border-l-2 pl-4 pr-3 text-sm transition-colors ${
        ativo
          ? 'border-spot-accent bg-white/[0.07] text-white font-semibold'
          : 'border-transparent text-spot-sidebarText/75 font-normal hover:bg-white/5 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

function TituloGrupo({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 px-4 pt-5 pb-2 first:pt-1">
      {children}
    </p>
  );
}

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [adminName, setAdminName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Esc fecha, o foco entra no menu e nao escapa para os botoes cobertos atras
  // dele — ver usePainelModal.
  const menuRef = usePainelModal<HTMLDivElement>({ aberto: menuOpen, aoFechar: () => setMenuOpen(false) });

  useEffect(() => {
    if (pathname === '/admin/login') return;
    // Sem `catch`, uma queda de rede virava rejeição não tratada no console.
    fetch('/api/auth/me?portal=admin')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdminName(d?.admin?.name ?? null))
      .catch(() => setAdminName(null));
  }, [pathname]);

  // Trocar de tela fecha o menu do celular — inclusive quando a navegação vem
  // do botão "voltar" do navegador, que não passa pelo onClick dos links.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (pathname === '/admin/login') return <>{children}</>;

  const logout = () => logoutAndLeave('admin');

  // Destaca só o item mais específico: em /admin/trainings/report, o item do
  // relatório acende e o de Treinamentos não — senão os dois ficariam ativos.
  const activeHref = activeNavHref(pathname, TODOS_OS_HREFS);

  return (
    <div className="min-h-dvh flex bg-spot-cream">
      <a href="#conteudo" className="pular-conteudo print:hidden">Pular para o conteúdo</a>
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-spot-sidebar text-spot-sidebarText print:hidden">
        <div className="px-4 py-6 flex items-center gap-3 border-b border-white/10">
          <SpotBrand size="sm" layout="row" />
          {/* spot-gray-400 aqui é proposital: sobre o fundo escuro da barra ele dá
              7.13:1, enquanto o gray-500 usado no resto do app cairia para
              3.89:1. A troca de contraste do restante das telas não vale aqui. */}
          <p className="text-[11px] text-spot-sidebarText/65 leading-tight">Restaurante Spot</p>
        </div>
        <nav className="flex-1 py-3 flex flex-col overflow-y-auto">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <TituloGrupo>{grupo.titulo}</TituloGrupo>
              {grupo.itens.map((item) => (
                <ItemMenu key={item.href} href={item.href} label={item.label} ativo={item.href === activeHref} />
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <p className="font-mono text-[11px] text-spot-sidebarText/65 truncate mb-1">{adminName}</p>
          <div className="flex items-center gap-3">
            {/* Era 20x16px — o menor alvo do app inteiro, e é o que encerra a
                sessão. O texto continua pequeno; a ÁREA é que cresceu. */}
            <button
              onClick={logout}
              className="inline-flex items-center min-h-11 px-2 -ml-2 text-xs text-spot-sidebarText/75 hover:text-white transition-colors"
            >
              Sair da conta
            </button>
            <NotificationBell portal="admin" placement="above" />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 bg-spot-sidebar text-spot-sidebarText flex items-center justify-between px-4 h-14 print:hidden">
        <div className="flex items-center gap-2">
          <SpotBrand size="sm" layout="row" />
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell portal="admin" />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="admin-menu-mobile"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="h-11 w-11 -mr-2 flex items-center justify-center"
          >
            {/* SVG e não os glifos ✕/☰: cada fonte do sistema desenha esses
                caracteres de um jeito (no Android o ☰ saía fino e deslocado). */}
            <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              {menuOpen ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>
      {menuOpen && (
        <>
          {/* Toque fora fecha o menu — antes só o ✕ fechava, e no celular a
              reação natural é tocar na página atrás. */}
          <div
            className="lg:hidden fixed inset-0 top-14 z-10 bg-black/50 animate-fadeIn"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            id="admin-menu-mobile"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de seções"
            className="lg:hidden fixed top-14 inset-x-0 z-20 bg-spot-sidebar text-spot-sidebarText py-2 flex flex-col max-h-[calc(100dvh-56px)] overflow-y-auto"
          >
            {GRUPOS.map((grupo) => (
              <div key={grupo.titulo}>
                <TituloGrupo>{grupo.titulo}</TituloGrupo>
                {grupo.itens.map((item) => (
                  <ItemMenu
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    ativo={item.href === activeHref}
                    onClick={() => setMenuOpen(false)}
                  />
                ))}
              </div>
            ))}
            <button
              onClick={logout}
              className="text-left flex items-center min-h-11 border-l-2 border-transparent pl-4 text-sm text-spot-sidebarText/75 mt-3 border-t border-t-white/10 pt-3"
            >
              Sair da conta
            </button>
          </div>
        </>
      )}

      <main id="conteudo" tabIndex={-1} className="flex-1 min-w-0 pt-14 lg:pt-0 print:pt-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 print:px-0 print:py-0 print:max-w-none">
          {/* key={pathname} reinicia a animação a cada troca de rota. É só
              opacidade: o "sobe e aparece" que havia aqui atrasava a leitura de
              toda página em ~350ms para não comunicar nada. */}
          <PushPrompt portal="admin" />
          <div key={pathname} className="animate-fadeIn">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
