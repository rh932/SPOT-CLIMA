'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmployeeCard, EmployeeList, EmptyState, iniciaisDe, etapaLabel, tomDoPrazo } from './EmployeeCard';
import {
  useGestorEmployees, isExperience, isPending, isFeedback, evaluationOpen, evaluationOverdue, feedbackDue, daysUntilDue,
  prazoBadge, EVALUATION_OPENS_DAYS, EVALUATION_FILL_DAYS,
} from './useGestorEmployees';
import { useMyPermissions } from './useMyPermissions';
import { useGestorSessao } from './GestorSessao';
import { AsyncSection, LiveStatus, RefreshingBar, Skeleton, SkeletonCardList } from '@/components/async';
import { FiltrosEquipeBar } from './FiltrosEquipeBar';
import { Ic } from '@/components/sp/Ic';
import { countUp, stick, RM } from '@/lib/motion';
import {
  FILTROS_VAZIOS, filtrarEquipe, ordenarEquipe, type ExtrasFiltro, type FiltrosEquipe,
} from '@/lib/gestorEquipe';
import type { GestorEmployee } from './useGestorEmployees';

/** Saudação pelo horário de quem abre a tela. */
const saudacao = (h: number) => (h < 12 ? 'Bom dia,' : h < 18 ? 'Boa tarde,' : 'Boa noite,');

const CONCLUSAO_ROTULO: Record<string, { rotulo: string; classe: string }> = {
  EFETIVAR: { rotulo: 'Efetivar', classe: 't-ok' },
  EXTENDER: { rotulo: 'Estender', classe: 't-gold' },
  DEMITIR: { rotulo: 'Desligar', classe: 't-late' },
};

/** Número que conta até o valor quando entra na tela. */
function Conta({ valor, sufixo = '' }: { valor: number; sufixo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) void countUp(ref.current, valor, 900, sufixo);
  }, [valor, sufixo]);
  return <span ref={ref}>{RM() ? valor + sufixo : '0' + sufixo}</span>;
}

/** Rascunhos de avaliação guardados neste aparelho (ver a tela de avaliação). */
function useRascunhos(ids: string[]) {
  const [achados, setAchados] = useState<{ id: string; t: number }[]>([]);
  useEffect(() => {
    try {
      const lista: { id: string; t: number }[] = [];
      for (const id of ids) {
        for (const sufixo of ['', '_2']) {
          const bruto = localStorage.getItem(`spot_clima_rascunho_avaliacao_${id}${sufixo}`);
          if (!bruto) continue;
          const t = Number(JSON.parse(bruto)?.t);
          if (Number.isFinite(t) && Date.now() - t < 7 * 24 * 3600 * 1000) lista.push({ id, t });
        }
      }
      setAchados(lista.sort((a, b) => b.t - a.t));
    } catch {
      setAchados([]);
    }
    // Só recalcula quando muda quem está na lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|')]);
  return achados;
}

export default function GestorDashboardPage() {
  const { can, loading: loadingPerms } = useMyPermissions();
  const router = useRouter();
  const { nome } = useGestorSessao();
  const { employees, todos, canEvaluate, loading, reloading, error, forbidden, reload } = useGestorEmployees();
  const [filtros, setFiltros] = useState<FiltrosEquipe>(FILTROS_VAZIOS);
  const painelRef = useRef<HTMLDivElement>(null);
  const [hora, setHora] = useState<Date | null>(null);
  useEffect(() => setHora(new Date()), []);

  // Treinador não tem avaliações: a porta de entrada dele é o treinamento.
  const soTreinamento = !loadingPerms && !can('evaluations.view') && can('trainings.view');
  useEffect(() => {
    if (soTreinamento) router.replace('/gestor/treinamento');
  }, [soTreinamento, router]);

  // Só quem ainda está em contrato de experiência. Deu baixa na última
  // avaliação, a pessoa sai daqui sozinha e passa para a aba Feedback.
  const emExperiencia = useMemo(
    () => employees.filter(isExperience).sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0)),
    [employees],
  );
  const rascunhos = useRascunhos(emExperiencia.map((e) => e.id));

  // Entrada da tela: os blocos caem em cascata quando os dados chegam.
  const pronto = !loadingPerms && !soTreinamento && !loading && !error && emExperiencia.length > 0;
  useEffect(() => {
    if (pronto && painelRef.current) stick(painelRef.current.querySelectorAll('[data-stick]'));
  }, [pronto]);

  // Esqueleto em vez de "Carregando...": o gestor abre esta tela no celular,
  // em rede ruim, e uma linha cinza numa tela branca lê como app quebrado.
  if (loadingPerms || soTreinamento) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <LiveStatus>Carregando o painel...</LiveStatus>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3 max-w-[18rem]" />
          <Skeleton className="h-3 w-full max-w-[26rem]" />
        </div>
        <SkeletonCardList rows={4} />
      </div>
    );
  }

  const urgent = emExperiencia.filter(evaluationOverdue);
  const abertas = emExperiencia.filter(evaluationOpen);
  const vencendoSemana = abertas.filter((e) => !evaluationOverdue(e) && (daysUntilDue(e) ?? 99) <= 7);
  const hojeAmanha = emExperiencia.filter((e) => (daysUntilDue(e) ?? 99) <= 1);

  // Ciclo do mês: avaliações de experiência já enviadas neste mês + as que ainda estão abertas.
  const agora = hora ?? new Date();
  const doMes = todos.flatMap((e) => e.evaluations.map((v) => ({ e, v }))).filter(({ v }) => {
    const d = new Date(v.evaluationDate);
    return v.period !== 'FEEDBACK' && d.getUTCMonth() === agora.getMonth() && d.getUTCFullYear() === agora.getFullYear();
  });
  const concluidasMes = doMes.length;
  const totalCiclo = concluidasMes + abertas.length;
  const fracConcl = totalCiclo ? concluidasMes / totalCiclo : 0;
  const fracRasc = totalCiclo ? Math.min(rascunhos.length, abertas.length) / totalCiclo : 0;
  // Arco semicircular de 251,3 de comprimento: o traço some pelo `--to`.
  const ARCO = 251.3;

  // Feedbacks (efetivados): o que vence e o que já venceu.
  const feedbacks = employees.filter(isFeedback);
  const feedbacksVencidos = employees.filter(feedbackDue);
  const feedbacksSemana = feedbacks.filter((e) => { const d = daysUntilDue(e); return d !== null && d > 0 && d <= 7; });

  // Próximos 14 dias: um marcador por pessoa no dia do prazo (atrasados ficam em hoje).
  const dias = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
    return { i, n: d.getDate(), wd: ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][d.getDay()], dd: String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'), fim: d.getDay() === 0 || d.getDay() === 6 };
  });
  const pendentes = employees.filter(isPending);
  const pinsDoDia = (i: number) =>
    pendentes.filter((e) => {
      const d = daysUntilDue(e);
      return d !== null && (i === 0 ? d <= 0 : d === i);
    });

  // Concluídas recentes (qualquer avaliação ou feedback já registrado).
  const recentes = todos
    .flatMap((e) => e.evaluations.map((v) => ({ e, v })))
    .sort((a, b) => +new Date(b.v.evaluationDate) - +new Date(a.v.evaluationDate))
    .slice(0, 3);

  // Equipe em experiência por unidade e por etapa.
  const contar = (chave: (e: GestorEmployee) => string) => {
    const m = new Map<string, number>();
    emExperiencia.forEach((e) => m.set(chave(e), (m.get(chave(e)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const porUnidade = contar((e) => e.unit?.name ?? 'Sem unidade');
  const porEtapa = contar((e) => (e.status === 'AWAITING_PERIOD_1' ? '45 dias' : '90 dias'));
  const maxBarra = Math.max(1, ...porUnidade.map((x) => x[1]), ...porEtapa.map((x) => x[1]));

  // Resultados do mês por conclusão.
  const resultados = (['EFETIVAR', 'EXTENDER', 'DEMITIR'] as const)
    .map((c) => ({ c, n: doMes.filter(({ v }) => v.conclusion === c).length }))
    .filter((x) => x.n > 0);
  const totalRes = resultados.reduce((s, x) => s + x.n, 0);

  // Filtros combinados: situação da avaliação, etapa (1ª ou 2ª), gerente
  // responsável e período de admissão — tudo sobre a lista que veio do banco.
  const extras: ExtrasFiltro<GestorEmployee> = {
    statusDe: (e) => (evaluationOverdue(e) ? 'ATRASADA' : evaluationOpen(e) ? 'PENDENTE' : 'AGUARDANDO'),
    etapaDe: (e) => (e.status === 'AWAITING_PERIOD_1' ? 'PRIMEIRA' : 'SEGUNDA'),
    responsaveisDe: (e) => e.responsaveis ?? [],
  };
  const filtrados = ordenarEquipe(filtrarEquipe(emExperiencia, filtros, extras), filtros.ordem, extras);
  const abertasFiltradas = filtrados.filter(evaluationOpen);
  const aguardando = filtrados.filter((e) => !evaluationOpen(e));
  const semResultado = emExperiencia.length > 0 && filtrados.length === 0;
  // Com ordenação escolhida, a lista vira uma só: separar em blocos desfaria a ordem.
  const listaUnica = filtros.ordem !== '';

  const primeiro = urgent[0] ?? abertas[0] ?? null;
  const primeiroNome = (nome ?? '').split(/\s+/)[0];
  const unidades = [...new Set(emExperiencia.map((e) => e.unit?.name).filter(Boolean))] as string[];
  const rascunhoPrincipal = rascunhos[0] ? emExperiencia.find((e) => e.id === rascunhos[0].id) : null;
  const hhmm = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const tagPrazo = (e: GestorEmployee) => {
    const b = prazoBadge(e);
    const tom = tomDoPrazo(b?.className);
    return { b, tom, classe: tom === 'atrasado' ? 't-late' : tom === 'perto' ? 't-week' : 't-soft' };
  };

  return (
    <div className="inicio">
      <RefreshingBar visible={reloading} texto="Atualizando a lista..." />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="a sua equipe"
        skeleton={<SkeletonCardList rows={4} />}
        empty={emExperiencia.length === 0}
        emptyState={
          <>
            <header className="hello-simples">
              <span className="accbar" />
              <h1 className="H">Avaliação de Experiência</h1>
            </header>
            <EmptyState>Ninguém em contrato de experiência.</EmptyState>
          </>
        }
      >
        <div className="dash" ref={painelRef}>
          {/* ───────── Saudação ───────── */}
          <section className="hello" data-stick aria-label="Resumo do dia">
            <h1>
              <span className="A" style={{ display: 'block' }}>{hora ? saudacao(hora.getHours()) : 'Olá,'}</span>
              <span className="H" style={{ display: 'block' }}>
                {primeiroNome || 'Gestor'}<span className="hl">.</span>
              </span>
            </h1>
            <div className="ctx">
              {unidades.map((u) => (
                <span key={u} className="chip"><Ic n="pin" s={15} />{u}</span>
              ))}
              <span className="chip"><Ic n="team" s={15} />{emExperiencia.length} em experiência</span>
              {hora && (
                <span className="chip">
                  <Ic n="cal" s={15} />
                  {hora.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase())}
                </span>
              )}
            </div>
            <div className="agenda desk">
              <span className="kick">Hoje e amanhã</span>
              {hojeAmanha.length === 0 && <small className="agenda-vazia">Nada vence hoje nem amanhã.</small>}
              {hojeAmanha.slice(0, 3).map((e) => {
                const t = tagPrazo(e);
                return (
                  <Link key={e.id} href={`/gestor/employees/${e.id}`} className="it">
                    <span className={`av ${t.tom === 'atrasado' ? 'late' : 'soon'}`} style={{ width: 34, height: 34, borderRadius: 11, fontSize: 12 }}>{iniciaisDe(e.fullName)}</span>
                    <span><b>{e.fullName.split(' ')[0]}</b><small>{t.b?.label ?? ''} · {etapaLabel(e)}</small></span>
                    <Ic n="right" s={16} />
                  </Link>
                );
              })}
              <a href="#fila" className="btn btn-ink" style={{ minHeight: 48, marginTop: 'auto', fontSize: 15 }}>Ver fila completa</a>
            </div>
            {primeiro && urgent.length > 0 && (
              <Link href={`/gestor/employees/${primeiro.id}`} className="alert">
                <span className="ic"><Ic n="clock" s={18} w={2.2} /></span>
                <span className="t">
                  <small>PRIMEIRO HOJE</small>
                  <b>{primeiro.fullName} · {prazoBadge(primeiro)?.label.toLowerCase()}</b>
                </span>
                <Ic n="right" s={18} w={2.2} />
              </Link>
            )}
          </section>

          {/* ───────── Ciclo do mês ───────── */}
          <section className="card cycle" data-stick aria-label="Progresso do ciclo">
            <div>
              <div className="gauge">
                <svg viewBox="0 0 200 110" width="240" height="132" aria-hidden="true">
                  <path className="g0" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" />
                  <path className="g2" style={{ ['--to' as string]: ARCO * (1 - Math.min(1, fracConcl + fracRasc)) }} d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" />
                  <path className="g1" style={{ ['--to' as string]: ARCO * (1 - fracConcl) }} d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" />
                </svg>
                <div className="num">
                  <b><Conta valor={concluidasMes} /><small>/{totalCiclo}</small></b>
                  <span>avaliações do mês</span>
                </div>
              </div>
              <div className="legend" style={{ justifyContent: 'center' }}>
                <span><i className="l-concl" />concluídas</span>
                <span><i className="l-rasc" />em rascunho</span>
              </div>
            </div>
            <div className="stats3">
              <div className="tile"><b className={urgent.length ? 'c-bad' : ''}><Conta valor={urgent.length} /></b><span>{urgent.length === 1 ? 'atrasada' : 'atrasadas'}</span></div>
              <div className="tile"><b><Conta valor={vencendoSemana.length} /></b><span>vencem esta semana</span></div>
              <div className="tile"><b className="c-active"><Conta valor={rascunhos.length} /></b><span>em rascunho</span></div>
            </div>
            {canEvaluate && primeiro && (
              <Link href={`/gestor/employees/${primeiro.id}`} className="btn btn-gold">
                <span>Começar uma avaliação</span>
                <span className="circ mk-ring"><Ic n="arrow" s={18} w={2.4} /></span>
              </Link>
            )}
          </section>

          {/* ───────── Feedbacks (no lugar de "dias seguidos": o sistema não tem sequência) ───────── */}
          <section className="card week" data-stick>
            <div className="rowhead">
              <b><Ic n="chat" s={18} /> Feedbacks da equipe</b>
              <span className="kick">efetivados</span>
            </div>
            <div className="stats3 stats2">
              <div className="tile"><b className={feedbacksVencidos.length ? 'c-bad' : ''}><Conta valor={feedbacksVencidos.length} /></b><span>{feedbacksVencidos.length === 1 ? 'vencido' : 'vencidos'}</span></div>
              <div className="tile"><b><Conta valor={feedbacksSemana.length} /></b><span>vencem esta semana</span></div>
            </div>
            <Link href="/gestor/feedback" className="link feed-link">Abrir feedbacks</Link>
            <p className="desk feed-nota">
              {feedbacks.length === 0
                ? 'Ninguém da sua equipe está no ciclo de feedback agora.'
                : <>São <b>{feedbacks.length}</b> {feedbacks.length === 1 ? 'pessoa' : 'pessoas'} no ciclo de feedback.</>}
            </p>
          </section>

          {/* ───────── Próximos 14 dias ───────── */}
          <section className="card timeline desk" data-stick>
            <div className="rowhead"><b><Ic n="cal" s={18} /> Próximos 14 dias</b><span className="kick">{dias[0].dd} → {dias[13].dd}</span></div>
            <div className="tl">
              {dias.map((x) => (
                <div key={x.i} className={`day ${x.i === 0 ? 'today' : ''} ${x.fim ? 'wknd' : ''}`}>
                  <small>{x.wd}</small>
                  <b>{x.n}</b>
                  {pinsDoDia(x.i).slice(0, 3).map((e) => {
                    const d = daysUntilDue(e) ?? 0;
                    return (
                      <Link key={e.id} href={`/gestor/employees/${e.id}`} className={`pin ${d < 0 ? 'late' : d <= 7 ? 'week' : 'gold'}`} title={`${e.fullName} · ${prazoBadge(e)?.label ?? ''}`} aria-label={`${e.fullName}, ${prazoBadge(e)?.label ?? ''}`}>
                        {iniciaisDe(e.fullName)}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          {/* ───────── Para avaliar ───────── */}
          <section className="queuebox" id="fila" data-stick>
            <div className="sechead">
              <h2 className="H">Para avaliar</h2>
              <span className="ln" />
              <a className="link" href="#todos">Ver todos ({emExperiencia.length})</a>
            </div>
            {abertas.length === 0 ? (
              <div className="vazio">Nenhuma avaliação aberta agora. A avaliação sobe {EVALUATION_OPENS_DAYS} dias antes do fim do contrato.</div>
            ) : (
              <>
                <div className="qhead desk kick" aria-hidden="true">
                  <span>Colaborador</span><span>Setor · unidade · turno</span><span>Etapa</span><span>Prazo</span><span>Situação</span><span />
                </div>
                <div className="queue">
                  {abertas.slice(0, 5).map((e, i) => <EmployeeCard key={e.id} employee={e} index={i} />)}
                </div>
              </>
            )}
          </section>

          {/* ───────── Coluna da direita ───────── */}
          <div className="rightcol desk">
            {rascunhoPrincipal && rascunhos[0] && (
              <section className="card resume" data-stick>
                <span className="kick" style={{ color: 'var(--c-active-text)' }}>Continuar de onde parou</span>
                <div className="resume-quem">
                  <span className="av wip">{iniciaisDe(rascunhoPrincipal.fullName)}</span>
                  <span style={{ flex: 1 }}>
                    <b style={{ display: 'block' }}>{rascunhoPrincipal.fullName}</b>
                    <small className="mut">Rascunho salvo às {hhmm(rascunhos[0].t)}</small>
                  </span>
                </div>
                <Link href={`/gestor/employees/${rascunhoPrincipal.id}`} className="btn btn-ink btn-block" style={{ minHeight: 48 }}>
                  Continuar <Ic n="arrow" s={18} w={2.2} className="arr" />
                </Link>
              </section>
            )}
            <section className="card" data-stick>
              <div className="rowhead"><b><Ic n="clock" s={18} /> Pendências</b><Link className="link" href="/gestor/pendencias">Ver todas</Link></div>
              <div className="mini-list">
                {urgent.length === 0 && <p className="mut mini-vazio">Nenhuma avaliação atrasada.</p>}
                {urgent.slice(0, 3).map((e) => (
                  <Link key={e.id} href={`/gestor/employees/${e.id}`} className="it">
                    <span className="av late" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 13 }}>{iniciaisDe(e.fullName)}</span>
                    <span><b style={{ fontSize: 15 }}>{e.fullName}</b><small>{prazoBadge(e)?.label}</small></span>
                    <Ic n="right" s={16} />
                  </Link>
                ))}
              </div>
            </section>
            <section className="card" data-stick>
              <div className="rowhead"><b><Ic n="check" s={18} /> Concluídas recentes</b><Link className="link" href="/gestor/historico">Histórico</Link></div>
              <div className="mini-list">
                {recentes.length === 0 && <p className="mut mini-vazio">Ainda não há avaliações registradas.</p>}
                {recentes.map(({ e, v }) => {
                  const c = v.conclusion ? CONCLUSAO_ROTULO[v.conclusion] : null;
                  return (
                    <div key={v.id} className="it">
                      <span className="av ok" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 13 }}>{iniciaisDe(e.fullName)}</span>
                      <span>
                        <b style={{ fontSize: 15 }}>{e.fullName}</b>
                        <small>{new Date(v.evaluationDate).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })} · {v.period === 'FIRST' ? '45 dias' : v.period === 'SECOND' ? '90 dias' : 'Feedback'}</small>
                      </span>
                      <span className={`tag ${c?.classe ?? 't-soft'}`}>{c?.rotulo ?? 'Feedback'}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ───────── Equipe por unidade e resultados ───────── */}
          <section className="card split desk" data-stick>
            <div className="rowhead"><b><Ic n="team" s={18} /> Equipe em experiência por unidade</b><span className="kick">{emExperiencia.length} {emExperiencia.length === 1 ? 'pessoa' : 'pessoas'}</span></div>
            <div className="bars">
              {porUnidade.map(([u, n], k) => (
                <div key={u} className="b"><span>{u}</span><span className="tr"><i className={k % 2 ? 'f-active' : 'f-accent'} style={{ width: `${(n / maxBarra) * 100}%` }} /></span><b>{n}</b></div>
              ))}
              {porEtapa.map(([u, n], k) => (
                <div key={u} className="b"><span>{u}</span><span className="tr"><i className={k % 2 ? 'f-text2' : 'f-ink'} style={{ width: `${(n / maxBarra) * 100}%` }} /></span><b>{n}</b></div>
              ))}
            </div>
          </section>
          <section className="card split desk" data-stick>
            <div className="rowhead"><b><Ic n="star" s={18} /> Resultados do mês</b><span className="kick">{concluidasMes} {concluidasMes === 1 ? 'concluída' : 'concluídas'}</span></div>
            {totalRes > 0 ? (
              <div className="stack">
                {resultados.map(({ c, n }) => (
                  <i key={c} className={c === 'EFETIVAR' ? 'f-accent' : c === 'EXTENDER' ? 'f-active' : 'f-bad'} style={{ width: `${(n / totalRes) * 100}%` }}>
                    {CONCLUSAO_ROTULO[c].rotulo} · {n}
                  </i>
                ))}
              </div>
            ) : (
              <p className="mut" style={{ marginTop: 8 }}>Nenhuma avaliação de experiência concluída neste mês.</p>
            )}
            <p className="mut res-nota">
              {EVALUATION_FILL_DAYS} dias para preencher depois que a avaliação sobe.
              {urgent.length === 0 ? ' Nenhuma passou do prazo.' : ` ${urgent.length} já passou do prazo.`}
            </p>
          </section>
        </div>

        {/* ───────── Lista completa, com todos os filtros de antes ───────── */}
        <section id="todos" className="todos">
          <div className="sechead">
            <h2 className="H">Todos em experiência</h2>
            <span className="ln" />
          </div>
          <p className="todos-sub mut">
            {canEvaluate
              ? `A avaliação sobe ${EVALUATION_OPENS_DAYS} dias antes do fim do contrato e você tem ${EVALUATION_FILL_DAYS} dias para preencher.`
              : 'Acompanhamento das avaliações nos seus setores, unidades e turnos. Quem avalia é o gestor do turno.'}
          </p>

          <FiltrosEquipeBar
            valor={filtros}
            onChange={setFiltros}
            pessoas={emExperiencia}
            statusOpcoes={[
              { valor: 'PENDENTE', rotulo: 'Pendente (disponível)' },
              { valor: 'ATRASADA', rotulo: 'Atrasada' },
              { valor: 'AGUARDANDO', rotulo: 'Aguardando prazo' },
            ]}
            etapaOpcoes={[
              { valor: 'PRIMEIRA', rotulo: '1ª avaliação (45 dias)' },
              { valor: 'SEGUNDA', rotulo: '2ª avaliação (90 dias)' },
            ]}
            rotuloEtapa="Etapa da experiência"
            responsaveis={emExperiencia.flatMap((e) => e.responsaveis ?? [])}
            rotuloResponsavel="Gerente responsável"
            comPeriodo
            comOrdem
            encontrados={filtrados.length}
            totalGeral={emExperiencia.length}
          />

          {semResultado && <EmptyState>Nenhuma avaliação para esta busca.</EmptyState>}

          {listaUnica && filtrados.length > 0 && (
            <EmployeeList>
              {filtrados.map((e) => <EmployeeCard key={e.id} employee={e} muted={!evaluationOpen(e)} />)}
            </EmployeeList>
          )}

          {!listaUnica && abertasFiltradas.length > 0 && (
            <div className="grupo-lista">
              <p className="kick grupo-rotulo">Avaliação disponível · {abertasFiltradas.length}</p>
              <EmployeeList>
                {abertasFiltradas.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}

          {!listaUnica && aguardando.length > 0 && (
            <div className="grupo-lista">
              <p className="kick grupo-rotulo">Em experiência · {aguardando.length}</p>
              <EmployeeList>
                {aguardando.map((e) => <EmployeeCard key={e.id} employee={e} muted />)}
              </EmployeeList>
            </div>
          )}
        </section>
      </AsyncSection>
    </div>
  );
}
