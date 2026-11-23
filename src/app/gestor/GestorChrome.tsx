'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { NotificationBell } from '@/components/NotificationBell';
import { PushGate } from '@/components/PushGate';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { Ic, type NomeIcone } from '@/components/sp/Ic';

import { useMyPermissions } from './useMyPermissions';
import { GestorSessaoContext } from './GestorSessao';
import { activeNavHref, logoutAndLeave } from '@/lib/nav';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Casca da área dos gestores no padrão Spot Integra: menu lateral fixo no
 * computador (grupos com rótulo em DM Mono) e barra de abas flutuante com
 * rótulos no celular. Com mais de 5 seções, as 4 principais ficam na barra e
 * o resto vai para a aba "Mais", uma lista grande e rotulada.
 *
 * Gestor, Gestor Líder e Treinador entram pela mesma porta; cada item só
 * aparece para quem tem a permissão dele. Isto é só interface: quem forçar a
 * URL de uma área que não é sua esbarra na checagem do backend.
 */
const NAV: {
  href: string;
  label: string;
  /** Rótulo curto da barra de abas do celular. */
  short: string;
  icone: NomeIcone;
  permission?: PermissionKey;
  grupo?: string;
}[] = [
  { href: '/gestor/cadastrar', label: 'Cadastrar Funcionário', short: 'Cadastrar', icone: 'plus', permission: 'employees.create', grupo: 'Cadastro' },
  // Quem já saiu do Spot: fora das listas da equipe, com o histórico guardado.
  { href: '/gestor/desligados', label: 'Desligados', short: 'Desligados', icone: 'out', permission: 'evaluations.view', grupo: 'Cadastro' },
  // O Início reúne o resumo do dia e a lista de Avaliação de Experiência (com todos os filtros).
  { href: '/gestor', label: 'Início · Avaliação de Experiência', short: 'Início', icone: 'home', permission: 'evaluations.view', grupo: 'Avaliação e feedback' },
  { href: '/gestor/feedback', label: 'Feedback', short: 'Feedback', icone: 'chat', permission: 'evaluations.view', grupo: 'Avaliação e feedback' },
  { href: '/gestor/pendencias', label: 'Pendências', short: 'Pendências', icone: 'clock', permission: 'evaluations.view', grupo: 'Avaliação e feedback' },
  { href: '/gestor/proximas', label: 'Próximas avaliações', short: 'Próximas', icone: 'cal', permission: 'evaluations.view', grupo: 'Avaliação e feedback' },
  { href: '/gestor/historico', label: 'Histórico de Avaliações e Feedbacks', short: 'Histórico', icone: 'hist', permission: 'evaluations.history.view', grupo: 'Avaliação e feedback' },
  { href: '/gestor/questionarios', label: 'Questionários do setor', short: 'Questionários', icone: 'list', permission: 'questionnaires.manage', grupo: 'Avaliação e feedback' },
  { href: '/gestor/treinamento', label: 'Gestão de Treinamentos', short: 'Treinar', icone: 'cap', permission: 'trainings.view', grupo: 'Treinamento' },
  { href: '/gestor/treinamento/historico', label: 'Histórico de Treinamentos', short: 'Treinos feitos', icone: 'hist', permission: 'trainings.history.view', grupo: 'Treinamento' },
  // Sem `permission`: todo mundo com acesso ao painel precisa conseguir achar o passo a passo.
  { href: '/gestor/guia', label: 'Passo a passo do painel', short: 'Passo a passo', icone: 'help' },
];

/** Quais seções ocupam a barra de abas do celular, em ordem de prioridade. */
const PRIORIDADE_ABAS = ['/gestor', '/gestor/feedback', '/gestor/pendencias', '/gestor/treinamento', '/gestor/historico', '/gestor/cadastrar'];

/** Mola do marcador do menu: desliza até o item novo em vez de apagar e acender. */
const MOLA_MENU = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;

const iniciais = (nome: string | null) =>
  (nome ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'G';

export function GestorChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [gestorName, setGestorName] = useState<string | null>(null);
  const [maisAberto, setMaisAberto] = useState(false);
  const [hoje, setHoje] = useState('');
  const { can, loading: loadingPerms, expired, failed } = useMyPermissions();
  const maisRef = usePainelModal<HTMLElement>({ aberto: maisAberto, aoFechar: () => setMaisAberto(false) });

  useEffect(() => {
    if (pathname === '/gestor/login') return;
    // Sem `catch`, uma queda de rede aqui virava rejeição não tratada. O nome é
    // enfeite do cabeçalho: se não vier, a tela segue.
    fetch('/api/auth/me?portal=gestor')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGestorName(d?.admin?.name ?? null))
      .catch(() => setGestorName(null));
  }, [pathname]);

  // A data só existe no navegador: calcular no servidor causaria diferença na hidratação.
  useEffect(() => {
    const d = new Date();
    const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
    const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    setHoje(`${dia} · ${d.getDate()} ${mes}`);
  }, []);

  // Trocar de tela fecha a lista "Mais".
  useEffect(() => setMaisAberto(false), [pathname]);

  // Sessão de 8h expirada com a página aberta: o middleware não tem como agir
  // (não houve navegação), então é a tela que manda de volta ao login.
  useEffect(() => {
    if (expired && pathname !== '/gestor/login') {
      const next = encodeURIComponent(pathname ?? '/gestor');
      router.replace(`/gestor/login?next=${next}`);
    }
  }, [expired, pathname, router]);

  if (pathname === '/gestor/login') return <>{children}</>;

  // Enquanto as permissões não chegam, não mostro item nenhum — melhor um
  // menu vazio por um instante do que piscar opções que somem em seguida.
  const visibleNav = loadingPerms ? [] : NAV.filter((item) => !item.permission || can(item.permission));

  /** Estado do menu quando não há itens para mostrar — nunca uma lista muda. */
  const navFallback = (className: string) => {
    if (loadingPerms) return <p className={className}>Carregando menu...</p>;
    if (expired) return <p className={className}>Sessão expirada. Redirecionando para o login...</p>;
    if (failed) {
      return (
        <button type="button" onClick={() => window.location.reload()} className={`${className} underline`}>
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

  // Barra do celular: até 5 seções cabem; passando disso, 4 + "Mais".
  const ordenadas = [...visibleNav].sort((a, b) => {
    const pa = PRIORIDADE_ABAS.indexOf(a.href);
    const pb = PRIORIDADE_ABAS.indexOf(b.href);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  const temMais = ordenadas.length > 5;
  const abas = temMais ? ordenadas.slice(0, 4) : ordenadas;
  const noMais = temMais ? ordenadas.slice(4) : [];
  const ativoEmMais = temMais && noMais.some((i) => i.href === ativo);

  return (
    // reducedMotion="user": com "reduzir movimento" ligado no aparelho, o
    // marcador do menu troca de lugar sem deslizar.
    <MotionConfig reducedMotion="user">
      <div className="app">
        <a href="#conteudo" className="pular-conteudo print:hidden">Pular para o conteúdo</a>

        <aside className="side print:hidden" aria-label="Menu do painel">
          <div className="brand">
            <Image src="/brand/spot-logo.png" alt="" width={26} height={30} />
            <b>Spot <span className="A">Integra</span></b>
          </div>
          <LayoutGroup id="menu-lateral">
            <nav aria-label="Seções do painel" style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', minHeight: 0 }}>
              {visibleNav.length === 0 && navFallback('grp kick')}
              {visibleNav.map((item, i) => (
                <div key={item.href} style={{ display: 'contents' }}>
                  {item.grupo && item.grupo !== visibleNav[i - 1]?.grupo && <span className="grp kick">{item.grupo}</span>}
                  <Link href={item.href} className="nav" aria-current={ativo === item.href ? 'page' : undefined}>
                    {ativo === item.href && <motion.span layoutId="marcador" transition={MOLA_MENU} aria-hidden className="nav-marca" />}
                    <span className="pi"><Ic n={item.icone} s={18} /></span>
                    <span className="nav-t">{item.label}</span>
                  </Link>
                </div>
              ))}
            </nav>
          </LayoutGroup>
          <div className="meb">
            <span className="me" style={{ display: 'grid', placeItems: 'center' }} aria-hidden="true">{iniciais(gestorName)}</span>
            <span>
              <b>{gestorName ?? 'Gestor'}</b>
              <small>Spot Integra</small>
            </span>
            <button type="button" className="ibtn" onClick={logout} aria-label="Sair da conta" title="Sair da conta">
              <Ic n="out" s={18} />
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="top print:hidden">
            <span className="me mob" style={{ display: 'grid', placeItems: 'center' }} aria-hidden="true">{iniciais(gestorName)}</span>
            <span className="who">
              <span className="kick">{hoje || 'SPOT INTEGRA'}</span>
              <b>{gestorName ?? 'Painel do gestor'}</b>
            </span>
            {/* Só quem recebe aviso vê o sino — o backend recusa a rota para os demais. */}
            {!loadingPerms && can('notifications.receive') && <NotificationBell portal="gestor" />}
            <button type="button" className="btn btn-ghost btn-sair mob" onClick={logout} aria-label="Sair da conta">
              Sair
            </button>
          </header>

          <main id="conteudo" tabIndex={-1} className="page">
            {!loadingPerms && can('notifications.receive') && <PushGate portal="gestor" onSair={logout} />}
            <div key={pathname} className="mk-open">
              <GestorSessaoContext.Provider value={{ nome: gestorName }}>{children}</GestorSessaoContext.Provider>
            </div>
          </main>

          <LayoutGroup id="abas-celular">
            <nav
              className="tabbar print:hidden"
              aria-label="Navegação principal"
              style={{ ['--n' as string]: abas.length + (temMais ? 1 : 0) }}
            >
              {abas.map((item) => (
                <Link key={item.href} href={item.href} aria-current={ativo === item.href ? 'page' : undefined}>
                  <Ic n={item.icone} s={21} />
                  <span>{item.short}</span>
                </Link>
              ))}
              {temMais && (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={maisAberto}
                  aria-current={ativoEmMais ? 'page' : undefined}
                  onClick={() => setMaisAberto(true)}
                >
                  <Ic n="more" s={21} />
                  <span>Mais</span>
                </button>
              )}
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
                {noMais.map((item) => (
                  <Link key={item.href} href={item.href} className="mais-item" aria-current={ativo === item.href ? 'page' : undefined}>
                    <span className="pi"><Ic n={item.icone} s={20} /></span>
                    <span className="mais-t">{item.label}</span>
                    <Ic n="right" s={18} className="chev" />
                  </Link>
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
