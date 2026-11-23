'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { ClassificationBadge } from '@/components/StatCard';
import { ErrorState, LiveStatus, RefreshingBar, Skeleton, SkeletonStats, SkeletonTable } from '@/components/async';
import type { SurveyResultsSummary } from '@/lib/results';
import { SystemNotices } from '@/components/admin/SystemNotices';
import { Secao } from '@/components/ui/Secao';
import { Ic } from '@/components/sp/Ic';
import { IndexBarChart, FavorabilityDonut } from '@/components/charts/Charts';
import { countUp, stick, RM } from '@/lib/motion';
import {
  isExperience, evaluationOpen, evaluationOverdue, daysUntilDue, prazoBadge, type GestorEmployee,
} from '@/app/gestor/useGestorEmployees';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', SCHEDULED: 'Agendada', OPEN: 'Aberta', CLOSED: 'Encerrada', ARCHIVED: 'Arquivada',
};

interface ActiveSurvey { id: string; name: string; status: string; openDate: string | null; closeDate: string | null }
interface Plano { id: string; problem: string; action: string; owner: string; priority: string; status: string; dueDate: string | null }

const PRIORIDADE: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
const ARCO = 251.3; // comprimento do arco semicircular do medidor

const saudacao = (h: number) => (h < 12 ? 'Bom dia,' : h < 18 ? 'Boa tarde,' : 'Boa noite,');
const iniciaisDe = (nome: string) => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }) : '—');

/** Número que conta até o valor quando entra na tela. */
function Conta({ valor, sufixo = '' }: { valor: number; sufixo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) void countUp(ref.current, valor, 900, sufixo);
  }, [valor, sufixo]);
  return <span ref={ref}>{RM() ? valor + sufixo : '0' + sufixo}</span>;
}

export default function AdminOverviewPage() {
  const [allSurveys, setAllSurveys] = useState<ActiveSurvey[]>([]);
  const [survey, setSurvey] = useState<ActiveSurvey | null>(null);
  const [results, setResults] = useState<SurveyResultsSummary | null>(null);
  const [anterior, setAnterior] = useState<SurveyResultsSummary | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [equipe, setEquipe] = useState<GestorEmployee[]>([]);
  const [nome, setNome] = useState<string | null>(null);
  const [hora, setHora] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHora(new Date()), []);

  const loadResultsFor = useCallback(async (s: ActiveSurvey, todas: ActiveSurvey[]) => {
    setSwitching(true);
    setResultsError(null);
    try {
      const { results } = await apiFetch<{ results: SurveyResultsSummary }>(`/api/admin/surveys/${s.id}/results`);
      setResults(results);
    } catch (e) {
      // Erro próprio, separado do carregamento da página: trocar de pesquisa e
      // falhar deixava os números da pesquisa ANTERIOR na tela, com o nome da
      // nova no seletor. Agora os números saem e a falha aparece.
      setResults(null);
      setResultsError(e instanceof Error ? e.message : 'Erro ao carregar os resultados.');
    } finally {
      setSwitching(false);
    }
    // A pesquisa anterior serve só para a variação do índice: se falhar, a variação some.
    const idx = todas.findIndex((x) => x.id === s.id);
    const prev = todas.slice(idx + 1).find((x) => x.status === 'CLOSED' || x.status === 'ARCHIVED') ?? null;
    if (prev) {
      apiFetch<{ results: SurveyResultsSummary }>(`/api/admin/surveys/${prev.id}/results`)
        .then((r) => setAnterior(r.results))
        .catch(() => setAnterior(null));
    } else {
      setAnterior(null);
    }
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ survey }, { surveys }] = await Promise.all([
        apiFetch<{ survey: ActiveSurvey | null }>('/api/admin/surveys/active'),
        apiFetch<{ surveys: ActiveSurvey[] }>('/api/admin/surveys'),
      ]);
      setSurvey(survey);
      setAllSurveys(surveys);
      if (survey) await loadResultsFor(survey, surveys);
      const { actionPlans } = await apiFetch<{ actionPlans: Plano[] }>('/api/admin/action-plans');
      setPlanos(actionPlans.filter((a) => a.status === 'NOT_STARTED' || a.status === 'IN_PROGRESS'));
    } catch (e) {
      // Sem este catch, uma falha aqui derrubava o dashboard no estado
      // "Nenhuma pesquisa foi criada ainda" — e o RH oferecia criar a primeira
      // pesquisa num sistema que já tinha várias.
      setError(e instanceof Error ? e.message : 'Erro ao carregar a visão geral.');
    } finally {
      setLoading(false);
    }
  }, [loadResultsFor]);

  useEffect(() => { carregar(); }, [carregar]);

  // Avaliações de experiência e nome de quem está logado: complementos da tela,
  // sem eles o resto aparece do mesmo jeito.
  useEffect(() => {
    apiFetch<{ employees: GestorEmployee[] }>('/api/admin/employees')
      .then((r) => setEquipe(r.employees.filter((e) => !e.desligado)))
      .catch(() => setEquipe([]));
    fetch('/api/auth/me?portal=admin')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNome(d?.admin?.name ?? null))
      .catch(() => setNome(null));
  }, []);

  const switchSurvey = async (id: string) => {
    const next = allSurveys.find((s) => s.id === id);
    if (!next) return;
    setSurvey(next);
    await loadResultsFor(next, allSurveys);
  };

  // Entrada da tela: os blocos caem em cascata quando os dados chegam.
  const pronto = !loading && !error && !!survey && !!results;
  useEffect(() => {
    if (pronto && painelRef.current) stick(painelRef.current.querySelectorAll('[data-stick]'));
  }, [pronto]);

  const emExperiencia = useMemo(() => equipe.filter(isExperience), [equipe]);
  const atrasadas = useMemo(() => emExperiencia.filter(evaluationOverdue), [emExperiencia]);
  const abertas = useMemo(() => emExperiencia.filter(evaluationOpen), [emExperiencia]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <LiveStatus>Carregando a visão geral...</LiveStatus>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3 w-72" />
        </div>
        <SkeletonStats cards={4} />
        <SkeletonTable rows={5} cols={3} />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={carregar} />;

  if (!survey) {
    return (
      <div className="vazio">
        <p className="font-semibold mb-2">Nenhuma pesquisa foi criada ainda.</p>
        <Link href="/admin/surveys" className="btn btn-gold" style={{ marginTop: 12 }}>
          Criar primeira pesquisa
        </Link>
      </div>
    );
  }

  const best = results?.byDimension[0];
  const worst = results?.byDimension[results.byDimension.length - 1];
  const participacao = results?.participationRate ?? 0;
  const variacao = results && !results.locked && anterior && !anterior.locked ? Math.round((results.climateIndex - anterior.climateIndex) * 10) / 10 : null;
  const primeiroNome = (nome ?? '').split(/\s+/)[0];
  const agora = hora ?? new Date();

  // Próximos 14 dias: prazos das avaliações (atrasadas ficam em hoje) e o fim da pesquisa.
  const dias = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
    return { i, n: d.getDate(), wd: ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][d.getDay()], dd: String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'), fim: d.getDay() === 0 || d.getDay() === 6, data: d };
  });
  const diasAteFim = survey.closeDate ? Math.round((new Date(survey.closeDate).getTime() - new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()) / 86400000) : null;
  const pinsDoDia = (i: number) => emExperiencia.filter((e) => { const d = daysUntilDue(e); return d !== null && (i === 0 ? d <= 0 : d === i); });

  // Experiência por unidade: atrasadas, abertas (já sobem para o gestor) e aguardando prazo.
  const porUnidade = [...new Set(emExperiencia.map((e) => e.unit?.name ?? 'Sem unidade'))].map((u) => {
    const doU = emExperiencia.filter((e) => (e.unit?.name ?? 'Sem unidade') === u);
    const at = doU.filter(evaluationOverdue).length;
    const ab = doU.filter((e) => evaluationOpen(e) && !evaluationOverdue(e)).length;
    return { u, total: doU.length, at, ab, ag: doU.length - at - ab };
  });
  const maxUn = Math.max(1, ...porUnidade.map((x) => x.total));

  return (
    <div className="inicio" ref={painelRef}>
      <SystemNotices />
      <div className="dash">
        {/* ───────── Saudação e "Hoje" ───────── */}
        <section className="hello" data-stick aria-label="Resumo do dia">
          <h1>
            <span className="A" style={{ display: 'block' }}>{hora ? saudacao(hora.getHours()) : 'Olá,'}</span>
            <span className="H" style={{ display: 'block' }}>{primeiroNome || 'RH'}<span className="hl">.</span></span>
          </h1>
          <div className="ctx">
            <span className="chip"><Ic n="list" s={15} />{STATUS_LABEL[survey.status] ?? survey.status}</span>
            {emExperiencia.length > 0 && <span className="chip"><Ic n="team" s={15} />{emExperiencia.length} em experiência</span>}
          </div>
          <div className="agenda desk">
            <span className="kick">Hoje</span>
            {atrasadas.length === 0 && diasAteFim === null && <small className="agenda-vazia">Nada pede atenção agora.</small>}
            {atrasadas.length > 0 && (
              <Link href="/admin/employees" className="it">
                <span className="av late" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 13 }}>{atrasadas.length}</span>
                <span><b>{atrasadas.length === 1 ? 'Avaliação atrasada' : 'Avaliações atrasadas'}</b><small>passaram do prazo de preenchimento</small></span>
                <Ic n="right" s={16} />
              </Link>
            )}
            {diasAteFim !== null && diasAteFim >= 0 && survey.status === 'OPEN' && (
              <Link href={`/admin/results?survey=${survey.id}`} className="it">
                <span className="av soon" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 13 }}>{diasAteFim}d</span>
                <span><b>{diasAteFim === 0 ? 'Pesquisa termina hoje' : 'Para a pesquisa terminar'}</b><small>{fmtData(survey.closeDate)} · participação {participacao}%</small></span>
                <Ic n="right" s={16} />
              </Link>
            )}
            <Link href={`/admin/results?survey=${survey.id}`} className="btn btn-ink" style={{ minHeight: 48, marginTop: 'auto', fontSize: 15 }}>Abrir resultado completo</Link>
          </div>
          {atrasadas.length > 0 && (
            <Link href="/admin/employees" className="alert">
              <span className="ic"><Ic n="clock" s={18} w={2.2} /></span>
              <span className="t">
                <small>PRECISA DE ATENÇÃO</small>
                <b>{atrasadas.length} {atrasadas.length === 1 ? 'avaliação de experiência atrasada' : 'avaliações de experiência atrasadas'}</b>
              </span>
              <Ic n="right" s={18} w={2.2} />
            </Link>
          )}
        </section>

        {/* ───────── Participação ───────── */}
        <section className="card cycle" data-stick aria-label="Participação na pesquisa">
          <div>
            <div className="gauge">
              <svg viewBox="0 0 200 110" width="240" height="132" aria-hidden="true">
                <path className="g0" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" />
                <path className="g1" style={{ ['--to' as string]: ARCO * (1 - Math.min(100, participacao) / 100) }} d="M 20 100 A 80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" />
              </svg>
              <div className="num">
                <b><Conta valor={participacao} sufixo="%" /></b>
                <span>participação</span>
              </div>
            </div>
          </div>
          <div className="stats3">
            <div className="tile"><b><Conta valor={results?.totalResponses ?? 0} /></b><span>respostas</span></div>
            <div className="tile"><b>{results?.eligiblePopulation ?? '—'}</b><span>colaboradores</span></div>
            <div className="tile"><b className={planos.length ? 'c-active' : ''}><Conta valor={planos.length} /></b><span>planos pendentes</span></div>
          </div>
          <Link href="/admin/surveys" className="btn btn-gold">
            <span>Ver pesquisas</span>
            <span className="circ mk-ring"><Ic n="arrow" s={18} w={2.4} /></span>
          </Link>
        </section>

        {/* ───────── Índice geral ───────── */}
        <section className="card week" data-stick aria-label="Índice de clima">
          <div className="rowhead"><b><Ic n="star" s={18} /> Índice de clima</b><span className="kick">{survey.name.slice(0, 22)}</span></div>
          {results?.locked && (
            <p className="mut indice-trava">
              <Ic n="lock" s={16} /> {results.lockedReason ?? 'Resultados protegidos pelo anonimato.'}
            </p>
          )}
          {results && !results.locked && (
            <>
              <p className="indice-grande"><Conta valor={results.climateIndex} sufixo="%" /></p>
              <p className="mut" style={{ marginTop: 4 }}>{results.climateClassification.label}</p>
              {variacao !== null && (
                <p className={`tag ${variacao > 0 ? 't-ok' : variacao < 0 ? 't-late' : 't-soft'} indice-var`}>
                  {variacao > 0 ? '▲ subiu' : variacao < 0 ? '▼ caiu' : 'igual a'} {variacao !== 0 ? `${Math.abs(variacao)} pontos` : 'a pesquisa anterior'}{variacao !== 0 ? ' desde a pesquisa anterior' : ''}
                </p>
              )}
              {variacao === null && <p className="mut" style={{ marginTop: 10, fontSize: 14 }}>Sem pesquisa anterior para comparar.</p>}
            </>
          )}
        </section>

        {/* ───────── Próximos 14 dias ───────── */}
        <section className="card timeline desk" data-stick>
          <div className="rowhead"><b><Ic n="cal" s={18} /> Próximos 14 dias</b><span className="kick">{dias[0].dd} → {dias[13].dd}</span></div>
          <div className="tl">
            {dias.map((x) => {
              const fimPesquisa = survey.status === 'OPEN' && diasAteFim === x.i;
              return (
                <div key={x.i} className={`day ${x.i === 0 ? 'today' : ''} ${x.fim ? 'wknd' : ''}`}>
                  <small>{x.wd}</small>
                  <b>{x.n}</b>
                  {fimPesquisa && <span className="pin gold" title="Fim da pesquisa" aria-label="Fim da pesquisa">FIM</span>}
                  {pinsDoDia(x.i).slice(0, 3).map((e) => {
                    const d = daysUntilDue(e) ?? 0;
                    return (
                      <Link key={e.id} href={`/admin/employees/${e.id}`} className={`pin ${d < 0 ? 'late' : d <= 7 ? 'week' : 'gold'}`} title={`${e.fullName} · ${prazoBadge(e)?.label ?? ''}`} aria-label={`${e.fullName}, ${prazoBadge(e)?.label ?? ''}`}>
                        {iniciaisDe(e.fullName)}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        {/* ───────── Resultado por dimensão e favorabilidade ───────── */}
        {results && results.byDimension.length > 0 && (
          <>
            <Secao className="card split-7" indice="01" titulo="Resultado por dimensão" apoio="Índice de 0 a 100%" acao={<Link href={`/admin/results?survey=${survey.id}`} className="link">Ver detalhes</Link>}>
              <IndexBarChart data={results.byDimension.map((d) => ({ name: d.dimension, index: d.index }))} />
            </Secao>
            <Secao className="card split-5" indice="02" titulo="Favorável × Neutro × Desfavorável">
              <FavorabilityDonut {...results.favorability} />
            </Secao>
          </>
        )}

        {/* ───────── Avaliações de experiência por unidade ───────── */}
        <section className="card split" data-stick>
          <div className="rowhead"><b><Ic n="team" s={18} /> Experiência por unidade</b><span className="kick">{emExperiencia.length} {emExperiencia.length === 1 ? 'pessoa' : 'pessoas'}</span></div>
          {porUnidade.length === 0 ? <p className="mut">Ninguém em contrato de experiência.</p> : (
            <div className="bars">
              {porUnidade.map((x) => (
                <div key={x.u} className="b b-un">
                  <span>{x.u}</span>
                  <span className="tr" role="img" aria-label={`${x.at} atrasadas, ${x.ab} vencendo, ${x.ag} aguardando prazo`}>
                    <i className="f-bad" style={{ width: `${(x.at / maxUn) * 100}%` }} />
                    <i className="f-active" style={{ width: `${(x.ab / maxUn) * 100}%` }} />
                    <i className="f-accent" style={{ width: `${(x.ag / maxUn) * 100}%` }} />
                  </span>
                  <b>{x.total}</b>
                </div>
              ))}
              <p className="legend"><span><i style={{ background: 'var(--c-bad)' }} />atrasadas</span><span><i style={{ background: 'var(--c-active)' }} />vencendo</span><span><i style={{ background: 'var(--c-accent)' }} />aguardando prazo</span></p>
            </div>
          )}
        </section>

        {/* ───────── Pendências por unidade (tabela) ───────── */}
        <section className="card split" data-stick>
          <div className="rowhead"><b><Ic n="clock" s={18} /> Avaliações pendentes</b><Link className="link" href="/admin/employees">Ver todas</Link></div>
          {abertas.length === 0 ? <p className="mut">Nenhuma avaliação aberta agora.</p> : (
            <table className="tabela" data-sem-cartao>
              <thead><tr><th>Colaborador</th><th>Unidade</th><th>Prazo</th></tr></thead>
              <tbody>
                {abertas.slice(0, 5).map((e) => {
                  const b = prazoBadge(e);
                  const atras = evaluationOverdue(e);
                  return (
                    <tr key={e.id}>
                      <td><Link href={`/admin/employees/${e.id}`} className="link">{e.fullName}</Link></td>
                      <td>{e.unit?.name ?? '—'}</td>
                      <td><span className={`tag ${atras ? 't-late' : 't-week'}`}>{b?.label ?? '—'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* ───────── Planos de ação em andamento ───────── */}
        <section className="card split-12" data-stick>
          <div className="rowhead"><b><Ic n="check" s={18} /> Planos de ação em andamento</b><Link className="link" href="/admin/action-plans">Abrir planos</Link></div>
          {planos.length === 0 ? <p className="mut">Nenhum plano pendente.</p> : (
            <div className="mini-list planos-lista">
              {planos.slice(0, 5).map((p) => (
                <Link key={p.id} href="/admin/action-plans" className="it">
                  <span className="av wip" aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 13 }}>{(PRIORIDADE[p.priority] ?? '?')[0]}</span>
                  <span><b style={{ fontSize: 15 }}>{p.problem}</b><small>{p.owner} · prioridade {(PRIORIDADE[p.priority] ?? p.priority).toLowerCase()}{p.dueDate ? ` · até ${fmtData(p.dueDate)}` : ''}</small></span>
                  <span className={`tag ${p.status === 'IN_PROGRESS' ? 't-gold' : 't-soft'}`}>{p.status === 'IN_PROGRESS' ? 'Em andamento' : 'Não iniciado'}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ───────── Pesquisa em foco, destaque e ponto de atenção ───────── */}
        <section className="card split-12 foco" data-stick>
          <div className="min-w-0 flex-1">
            <p className="stat-rotulo">Pesquisa em foco</p>
            {allSurveys.length > 1 ? (
              <select className="input foco-sel" value={survey.id} onChange={(e) => switchSurvey(e.target.value)} aria-label="Pesquisa em foco">
                {allSurveys.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <p className="foco-nome">{survey.name}</p>
            )}
          </div>
          <RefreshingBar visible={switching && !!results} texto="Carregando os resultados..." />
          <span className="tag t-gold">{STATUS_LABEL[survey.status]}</span>
        </section>

        {switching && !results && (
          <div aria-busy="true" className="split-12 flex flex-col gap-6">
            <LiveStatus>Carregando os resultados da pesquisa...</LiveStatus>
            <SkeletonStats cards={4} />
            <SkeletonTable rows={4} cols={3} />
          </div>
        )}
        {resultsError && !switching && <div className="split-12"><ErrorState message={resultsError} onRetry={() => loadResultsFor(survey, allSurveys)} /></div>}

        {best && (
          <section className="card split-6 ponta" data-stick>
            <p className="stat-rotulo">Destaque</p>
            <p className="ponta-nome">{best.dimension}</p>
            <div className="ponta-linha"><span className="ponta-num c-ok">{best.index}%</span><ClassificationBadge label={best.classification.label} colorToken={best.classification.colorToken} /></div>
          </section>
        )}
        {worst && (
          <section className="card split-6 ponta" data-stick>
            <p className="stat-rotulo">Ponto de atenção</p>
            <p className="ponta-nome">{worst.dimension}</p>
            <div className="ponta-linha"><span className="ponta-num c-bad">{worst.index}%</span><ClassificationBadge label={worst.classification.label} colorToken={worst.classification.colorToken} /></div>
          </section>
        )}

        {results && results.insights.length > 0 && (
          <Secao className="card split-12" indice="03" titulo="Leitura da pesquisa">
            <ul className="flex flex-col">
              {results.insights.map((insight, i) => (
                <li key={i} className="insight-linha">
                  <span aria-hidden className="secao-indice">{String(i + 1).padStart(2, '0')}</span>
                  {insight}
                </li>
              ))}
            </ul>
          </Secao>
        )}
      </div>
    </div>
  );
}
