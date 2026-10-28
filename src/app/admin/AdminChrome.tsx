'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { SpotBrand } from '@/components/theme/SpotBrand';
import { NotificationBell } from '@/components/NotificationBell';
import { PushPrompt } from '@/components/PushPrompt';
import { activeNavHref, logoutAndLeave } from '@/lib/nav';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { Icone, type NomeIcone } from '@/components/ui/Icone';

/**
 * O menu do admin tem 16 destinos. Numa lista corrida ninguém encontra nada: o
 * olho varre 16 linhas iguais. Dois recursos resolvem isso sem tirar destino:
 *   - os itens são agrupados pelo assunto de quem procura (a pesquisa em si,
 *     as pessoas, o cadastro que sustenta os dois, o sistema);
 *   - cada item tem um ícone de traço (SVG), que dá ao olho um ponto de
 *     reconhecimento antes de ler o rótulo.
 */
const GRUPOS: { titulo: string; itens: { href: string; label: string; icone: NomeIcone }[] }[] = [
  {
    titulo: 'Pesquisa',
    itens: [
      { href: '/admin', label: 'Visão Geral', icone: 'inicio' },
      { href: '/admin/surveys', label: 'Pesquisas', icone: 'pesquisa' },
      { href: '/admin/templates', label: 'Modelos', icone: 'modelo' },
      { href: '/admin/results', label: 'Resultados', icone: 'resultado' },
      { href: '/admin/comments', label: 'Comentários', icone: 'comentario' },
      { href: '/admin/comparisons', label: 'Comparativos', icone: 'comparar' },
      { href: '/admin/reports', label: 'Relatórios', icone: 'relatorio' },
    ],
  },
  {
    titulo: 'Pessoas',
    itens: [
      { href: '/admin/employees', label: 'Avaliação de Experiência', icone: 'pessoa' },
      { href: '/admin/evaluations', label: 'Histórico de Avaliações', icone: 'historico' },
      { href: '/admin/indicadores', label: 'Indicadores da Experiência', icone: 'indicador' },
      { href: '/admin/trainings', label: 'Treinamentos', icone: 'treino' },
      { href: '/admin/trainings/report', label: 'Relatório de Treinamentos', icone: 'relatorio' },
      { href: '/admin/action-plans', label: 'Plano de Ação', icone: 'plano' },
    ],
  },
  {
    titulo: 'Cadastro',
    itens: [
      { href: '/admin/sectors', label: 'Setores', icone: 'setor' },
      { href: '/admin/units', label: 'Unidades', icone: 'unidade' },
      { href: '/admin/dimensions', label: 'Dimensões', icone: 'dimensao' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { href: '/admin/users', label: 'Usuários', icone: 'usuarios' },
      { href: '/admin/settings', label: 'Configurações', icone: 'config' },
    ],
  },
];

const TODOS_OS_HREFS = GRUPOS.flatMap((g) => g.itens.map((i) => i.href));

/**
 * Item do menu. O ativo vira uma tecla clara sobre a barra escura (papel com
 * texto de tinta), como as abas de um painel físico. Alvo de toque de 44px.
 *
 * A tecla é elemento compartilhado (`layoutId`): ao trocar de tela ele desliza
 * com mola do item antigo até o novo, e o olho acompanha para onde foi em vez
 * de procurar o item aceso. Cada lista (lateral, menu do celular) fica num
 * LayoutGroup próprio — senão o filete da lista escondida por CSS tentaria
 * voar até a visível.
 */
const MOLA_MENU = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;

function ItemMenu({
  href,
  label,
  icone,
  ativo,
  onClick,
}: {
  href: string;
  label: string;
  icone: NomeIcone;
  ativo: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      className={`group relative isolate mx-3 flex items-center gap-3 min-h-11 rounded-btn px-3 text-sm transition-colors ${
        ativo
          ? 'text-spot-sidebar font-semibold'
          : 'text-spot-sidebarText/70 font-normal hover:text-white'
      }`}
    >
      {ativo && (
        <motion.span layoutId="filete" transition={MOLA_MENU} aria-hidden className="absolute inset-0 -z-10 rounded-btn bg-spot-sidebarText" />
      )}
      <Icone nome={icone} className={`h-[18px] w-[18px] ${ativo ? 'text-spot-sidebar' : 'text-spot-sidebarText/60 group-hover:text-spot-sidebarText'}`} />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function TituloGrupo({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] text-spot-sidebarText/55 px-6 pt-5 pb-1.5 first:pt-1">
      {children}
    </p>
  );
}

/** Avatar de iniciais: no lugar de foto, que o sistema não guarda. */
function Avatar({ nome }: { nome: string | null }) {
  const iniciais = (nome ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-spot-yellow text-spot-onYellow font-mono text-sm font-medium">
      {iniciais || '·'}
    </span>
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
    // reducedMotion="user": com "reduzir movimento" ligado no aparelho, as
    // animações do Motion trocam o deslocamento por um corte seco.
    <MotionConfig reducedMotion="user">
    <div className="min-h-dvh flex bg-spot-cream">
      <a href="#conteudo" className="pular-conteudo print:hidden">Pular para o conteúdo</a>
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-spot-sidebar text-spot-sidebarText print:hidden sticky top-0 h-dvh z-40">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-white/10">
          <SpotBrand size="sm" layout="row" />
          <p className="text-[11px] text-spot-sidebarText/65 leading-tight">Restaurante Spot</p>
        </div>
        <LayoutGroup id="menu-lateral">
        {/* layoutScroll: a lista rola, e sem isto a mola mede o item no lugar
            errado quando o menu não está no topo. */}
        <motion.nav layoutScroll className="flex-1 py-3 flex flex-col overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Seções do painel">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <TituloGrupo>{grupo.titulo}</TituloGrupo>
              <div className="flex flex-col gap-0.5">
                {grupo.itens.map((item) => (
                  <ItemMenu key={item.href} {...item} ativo={item.href === activeHref} />
                ))}
              </div>
            </div>
          ))}
        </motion.nav>
        </LayoutGroup>
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-3">
            <Avatar nome={adminName} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-spot-sidebarText truncate">{adminName ?? 'Conta'}</p>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-spot-sidebarText/65">Painel do RH</p>
            </div>
            <NotificationBell portal="admin" placement="above" />
          </div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2 min-h-11 rounded-btn px-2 text-sm text-spot-sidebarText/75 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Icone nome="sair" className="h-[18px] w-[18px]" />
            Sair da conta
          </button>
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
            <Icone nome={menuOpen ? 'fechar' : 'menu'} className="h-5 w-5" />
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
          <LayoutGroup id="menu-celular">
          <motion.div
            layoutScroll
            id="admin-menu-mobile"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de seções"
            className="lg:hidden fixed top-14 inset-x-0 z-20 bg-spot-sidebar text-spot-sidebarText py-2 flex flex-col max-h-[calc(100dvh-56px)] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {GRUPOS.map((grupo) => (
              <div key={grupo.titulo}>
                <TituloGrupo>{grupo.titulo}</TituloGrupo>
                <div className="flex flex-col gap-0.5">
                  {grupo.itens.map((item) => (
                    <ItemMenu
                      key={item.href}
                      {...item}
                      ativo={item.href === activeHref}
                      onClick={() => setMenuOpen(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={logout}
              className="mx-3 mt-3 flex items-center gap-3 min-h-11 rounded-btn px-3 text-left text-sm text-spot-sidebarText/75 hover:bg-white/5 border-t border-t-white/10"
            >
              <Icone nome="sair" className="h-[18px] w-[18px]" />
              Sair da conta
            </button>
          </motion.div>
          </LayoutGroup>
        </>
      )}

      <main id="conteudo" tabIndex={-1} className="flex-1 min-w-0 pt-14 lg:pt-0 print:pt-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
        <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8 print:px-0 print:py-0 print:max-w-none">
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
    </MotionConfig>
  );
}
