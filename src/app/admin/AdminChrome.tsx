'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { NotificationBell } from '@/components/NotificationBell';
import { PushPrompt } from '@/components/PushPrompt';
import { activeNavHref, logoutAndLeave } from '@/lib/nav';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { Icone, type NomeIcone } from '@/components/ui/Icone';
import { Ic } from '@/components/sp/Ic';
import { rotularTabelas } from '@/lib/tabelaCartoes';

/**
 * Casca do painel do RH no padrão Spot Integra: menu lateral fixo no
 * computador, agrupado por rótulos em DM Mono (CLIMA, EXPERIÊNCIA,
 * CADASTROS), e barra de abas flutuante no celular com 4 seções e "Mais".
 *
 * O RH vê tudo das outras duas áreas, então os 21 destinos continuam todos
 * aqui; só mudou o agrupamento e o desenho. O bloqueio real de cada rota
 * continua no backend.
 */
const GRUPOS: { titulo: string; itens: { href: string; label: string; short: string; icone: NomeIcone }[] }[] = [
  {
    titulo: 'Clima',
    itens: [
      { href: '/admin', label: 'Visão Geral', short: 'Início', icone: 'inicio' },
      { href: '/admin/surveys', label: 'Pesquisas', short: 'Pesquisas', icone: 'pesquisa' },
      { href: '/admin/results', label: 'Resultados', short: 'Resultados', icone: 'resultado' },
      { href: '/admin/comments', label: 'Comentários', short: 'Comentários', icone: 'comentario' },
      { href: '/admin/comparisons', label: 'Comparativos', short: 'Comparativos', icone: 'comparar' },
      { href: '/admin/reports', label: 'Relatórios', short: 'Relatórios', icone: 'relatorio' },
      { href: '/admin/action-plans', label: 'Plano de Ação', short: 'Planos', icone: 'plano' },
      { href: '/admin/templates', label: 'Modelos', short: 'Modelos', icone: 'modelo' },
    ],
  },
  {
    titulo: 'Experiência',
    itens: [
      { href: '/admin/employees', label: 'Avaliação de Experiência', short: 'Experiência', icone: 'pessoa' },
      { href: '/admin/evaluations', label: 'Histórico de Avaliações e Feedbacks', short: 'Histórico', icone: 'historico' },
      { href: '/admin/questionarios', label: 'Questionários', short: 'Questionários', icone: 'modelo' },
      { href: '/admin/indicadores', label: 'Indicadores da Experiência', short: 'Indicadores', icone: 'indicador' },
      { href: '/admin/trainings', label: 'Treinamentos', short: 'Treinamentos', icone: 'treino' },
      { href: '/admin/trainings/report', label: 'Relatório de Treinamentos', short: 'Treinos', icone: 'relatorio' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { href: '/admin/cadastrar', label: 'Cadastrar Funcionário', short: 'Cadastrar', icone: 'pessoa' },
      { href: '/admin/sectors', label: 'Setores', short: 'Setores', icone: 'setor' },
      { href: '/admin/units', label: 'Unidades', short: 'Unidades', icone: 'unidade' },
      { href: '/admin/dimensions', label: 'Dimensões', short: 'Dimensões', icone: 'dimensao' },
      { href: '/admin/users', label: 'Usuários', short: 'Usuários', icone: 'usuarios' },
      { href: '/admin/settings', label: 'Configurações', short: 'Ajustes', icone: 'config' },
    ],
  },
];

const ITENS = GRUPOS.flatMap((g) => g.itens);
const TODOS_OS_HREFS = ITENS.map((i) => i.href);

/** As 4 seções da barra de abas do celular; o resto fica em "Mais". */
const ABAS = ['/admin', '/admin/results', '/admin/employees', '/admin/surveys'];

/** Mola do marcador do menu: desliza até o item novo em vez de apagar e acender. */
const MOLA_MENU = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;

const iniciais = (nome: string | null) =>
  (nome ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'RH';

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [adminName, setAdminName] = useState<string | null>(null);
  const [maisAberto, setMaisAberto] = useState(false);
  const [hoje, setHoje] = useState('');
  const paginaRef = useRef<HTMLElement>(null);
  const maisRef = usePainelModal<HTMLElement>({ aberto: maisAberto, aoFechar: () => setMaisAberto(false) });

  useEffect(() => {
    if (pathname === '/admin/login') return;
    // Sem `catch`, uma queda de rede virava rejeição não tratada no console.
    fetch('/api/auth/me?portal=admin')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdminName(d?.admin?.name ?? null))
      .catch(() => setAdminName(null));
  }, [pathname]);

  // A data só existe no navegador: calcular no servidor causaria diferença na hidratação.
  useEffect(() => {
    const d = new Date();
    const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
    const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    setHoje(`${dia} · ${d.getDate()} ${mes}`);
  }, []);

  // Trocar de tela fecha a lista "Mais" — inclusive pelo "voltar" do navegador.
  useEffect(() => { setMaisAberto(false); }, [pathname]);

  // No celular, cada linha de tabela vira cartão com rótulo e valor: os
  // rótulos saem do cabeçalho da própria tabela (ver lib/tabelaCartoes).
  useEffect(() => {
    if (pathname === '/admin/login' || !paginaRef.current) return;
    return rotularTabelas(paginaRef.current);
  }, [pathname]);

  if (pathname === '/admin/login') return <>{children}</>;

  const logout = () => logoutAndLeave('admin');

  // Destaca só o item mais específico: em /admin/trainings/report, o item do
  // relatório acende e o de Treinamentos não.
  const ativo = activeNavHref(pathname, TODOS_OS_HREFS);
  const abas = ABAS.map((h) => ITENS.find((i) => i.href === h)!);
  const noMais = GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => !ABAS.includes(i.href)) }));
  const ativoEmMais = ativo ? !ABAS.includes(ativo) : false;

  return (
    // reducedMotion="user": com "reduzir movimento" ligado no aparelho, o
    // marcador do menu troca de lugar sem deslizar.
    <MotionConfig reducedMotion="user">
      <div className="app admin-app">
        <a href="#conteudo" className="pular-conteudo print:hidden">Pular para o conteúdo</a>

        <aside className="side print:hidden" aria-label="Menu do painel do RH">
          <div className="brand">
            <Image src="/brand/spot-logo.png" alt="" width={26} height={30} />
            <b>Spot <span className="A">Integra</span></b>
          </div>
          <LayoutGroup id="menu-lateral">
            <nav aria-label="Seções do painel" className="side-nav">
              {GRUPOS.map((g) => (
                <div key={g.titulo} style={{ display: 'contents' }}>
                  <span className="grp kick">{g.titulo}</span>
                  {g.itens.map((item) => (
                    <Link key={item.href} href={item.href} className="nav" aria-current={ativo === item.href ? 'page' : undefined}>
                      {ativo === item.href && <motion.span layoutId="marcador" transition={MOLA_MENU} aria-hidden className="nav-marca" />}
                      <span className="pi"><Icone nome={item.icone} className="h-[18px] w-[18px]" /></span>
                      <span className="nav-t">{item.label}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </LayoutGroup>
          <div className="meb">
            <span className="me" style={{ display: 'grid', placeItems: 'center' }} aria-hidden="true">{iniciais(adminName)}</span>
            <span>
              <b>{adminName ?? 'Conta'}</b>
              <small>Painel do RH</small>
            </span>
            <button type="button" className="ibtn" onClick={logout} aria-label="Sair da conta" title="Sair da conta">
              <Ic n="out" s={18} />
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="top print:hidden">
            <span className="me mob" style={{ display: 'grid', placeItems: 'center' }} aria-hidden="true">{iniciais(adminName)}</span>
            <span className="who">
              <span className="kick">{hoje || 'SPOT INTEGRA'}</span>
              <b>{adminName ?? 'Painel do RH'}</b>
            </span>
            <NotificationBell portal="admin" />
            <button type="button" className="btn btn-ghost btn-sair mob" onClick={logout} aria-label="Sair da conta">Sair</button>
          </header>

          <main id="conteudo" tabIndex={-1} className="page admin-page" ref={paginaRef}>
            <PushPrompt portal="admin" />
            {/* A animação de entrada não pode reter transform (ver .mk-open). */}
            <div key={pathname} className="mk-open">
              {children}
            </div>
          </main>

          <LayoutGroup id="abas-celular">
            <nav className="tabbar print:hidden" aria-label="Navegação principal" style={{ ['--n' as string]: abas.length + 1 }}>
              {abas.map((item) => (
                <Link key={item.href} href={item.href} aria-current={ativo === item.href ? 'page' : undefined}>
                  <Icone nome={item.icone} className="h-[21px] w-[21px]" />
                  <span>{item.short}</span>
                </Link>
              ))}
              <button type="button" aria-haspopup="dialog" aria-expanded={maisAberto} aria-current={ativoEmMais ? 'page' : undefined} onClick={() => setMaisAberto(true)}>
                <Ic n="more" s={21} />
                <span>Mais</span>
              </button>
            </nav>
          </LayoutGroup>
        </div>

        {maisAberto && (
          <>
            <div className="sheet-bd" onClick={() => setMaisAberto(false)} aria-hidden="true" />
            <section ref={maisRef} className="sheet sheet-mais" role="dialog" aria-modal="true" aria-label="Todas as seções">
              <span className="grab" aria-hidden="true" />
              <div className="mais-cab">
                <h2 className="H">Todas as seções</h2>
                <button type="button" className="ibtn" onClick={() => setMaisAberto(false)} aria-label="Fechar a lista de seções">
                  <Ic n="x" s={18} w={2.2} />
                </button>
              </div>
              <nav aria-label="Mais seções" className="mais-lista">
                {noMais.map((g) => (
                  <div key={g.titulo} style={{ display: 'contents' }}>
                    {g.itens.length > 0 && <span className="kick mais-grupo">{g.titulo}</span>}
                    {g.itens.map((item) => (
                      <Link key={item.href} href={item.href} className="mais-item" aria-current={ativo === item.href ? 'page' : undefined}>
                        <span className="pi"><Icone nome={item.icone} className="h-5 w-5" /></span>
                        <span className="mais-t">{item.label}</span>
                        <Ic n="right" s={18} className="chev" />
                      </Link>
                    ))}
                  </div>
                ))}
                <button type="button" className="mais-item mais-sair" onClick={logout}>
                  <span className="pi"><Ic n="out" s={20} /></span>
                  <span className="mais-t">Sair da conta</span>
                </button>
              </nav>
            </section>
          </>
        )}
      </div>
    </MotionConfig>
  );
}
