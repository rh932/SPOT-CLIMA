'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { StatCard, ClassificationBadge } from '@/components/StatCard';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { ReguaIndicadores, Secao } from '@/components/ui/Secao';
import { ErrorState, LiveStatus, RefreshingBar, Skeleton, SkeletonStats, SkeletonTable } from '@/components/async';
import type { SurveyResultsSummary } from '@/lib/results';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', SCHEDULED: 'Agendada', OPEN: 'Aberta', CLOSED: 'Encerrada', ARCHIVED: 'Arquivada',
};

interface ActiveSurvey { id: string; name: string; status: string; openDate: string | null; closeDate: string | null }

export default function AdminOverviewPage() {
  const [allSurveys, setAllSurveys] = useState<ActiveSurvey[]>([]);
  const [survey, setSurvey] = useState<ActiveSurvey | null>(null);
  const [results, setResults] = useState<SurveyResultsSummary | null>(null);
  const [pendingActions, setPendingActions] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const loadResultsFor = useCallback(async (s: ActiveSurvey) => {
    setSwitching(true);
    setResultsError(null);
    try {
      const { results } = await apiFetch<{ results: SurveyResultsSummary }>(`/api/admin/surveys/${s.id}/results`);
      setResults(results);
    } catch (e) {
      // Erro próprio, separado do carregamento da pagina: trocar de pesquisa e
      // falhar deixava os números da pesquisa ANTERIOR na tela, com o nome da
      // nova no seletor. Agora os números saem e a falha aparece.
      setResults(null);
      setResultsError(e instanceof Error ? e.message : 'Erro ao carregar os resultados.');
    } finally {
      setSwitching(false);
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
      if (survey) await loadResultsFor(survey);
      const { actionPlans } = await apiFetch<{ actionPlans: { status: string; dueDate: string | null }[] }>('/api/admin/action-plans');
      setPendingActions(actionPlans.filter((a) => a.status === 'NOT_STARTED' || a.status === 'IN_PROGRESS').length);
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

  const switchSurvey = async (id: string) => {
    const next = allSurveys.find((s) => s.id === id);
    if (!next) return;
    setSurvey(next);
    await loadResultsFor(next);
  };

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
      <div className="border-y border-spot-gray-200 text-center py-14">
        <p className="font-semibold mb-2">Nenhuma pesquisa foi criada ainda.</p>
        <Link href="/admin/surveys" className="btn-primary inline-flex mt-3">
          Criar primeira pesquisa
        </Link>
      </div>
    );
  }

  const best = results?.byDimension[0];
  const worst = results?.byDimension[results.byDimension.length - 1];

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoPagina
        titulo="Visão Geral"
        subtitulo="Clima organizacional da pesquisa em foco."
        acao={
          <Link href={`/admin/results?survey=${survey.id}`} className="btn-secondary">
            Ver dashboard completo
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-spot-gray-300 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Pesquisa em foco</p>
          {allSurveys.length > 1 ? (
            <select
              className="input !w-auto font-display font-semibold text-lg !py-1.5 mt-1"
              value={survey.id}
              onChange={(e) => switchSurvey(e.target.value)}
            >
              {allSurveys.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <p className="font-display font-semibold text-xl mt-0.5">{survey.name}</p>
          )}
        </div>
        <span className="badge badge-good">{STATUS_LABEL[survey.status]}</span>
      </div>

      {/* Troca de pesquisa: esqueleto com a forma dos cartões, em vez de uma
          linha de texto que deixa a página saltando de altura. */}
      {switching && (
        <div aria-busy="true" className="flex flex-col gap-6">
          <LiveStatus>Carregando os resultados da pesquisa...</LiveStatus>
          <SkeletonStats cards={4} />
          <SkeletonTable rows={4} cols={3} />
        </div>
      )}

      {resultsError && !switching && (
        <ErrorState message={resultsError} onRetry={() => loadResultsFor(survey)} />
      )}

      {results && !switching && (
        <>
          <ReguaIndicadores>
            <StatCard label="Índice de Clima" value={`${results.climateIndex}%`} sub={results.climateClassification.label} />
            <StatCard
              label="Participação"
              value={`${results.participationRate}%`}
              sub={`${results.totalResponses} / ${results.eligiblePopulation ?? '—'} colaboradores`}
            />
            <StatCard label="Total de respostas" value={String(results.totalResponses)} sub={results.participationClassification} />
            <StatCard label="Planos de ação pendentes" value={String(pendingActions)} sub="Não iniciados ou em andamento" />
          </ReguaIndicadores>

          {/* As duas pontas da pesquisa lado a lado: a dimensão que melhor
              foi e a que pior foi. Antes eram dois cards de peso igual ao de
              qualquer outro bloco; agora é um par, separado por um filete, que
              se lê de uma vez. As cores saem da MESMA escala do mapa de calor
              (#0F7A3D = 5.42:1 e #C93A3A = 5.06:1 sobre branco). */}
          <Secao indice="01" titulo="Extremos da pesquisa">
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-spot-gray-200 divide-y sm:divide-y-0">
              {best && (
                <div className="pb-5 sm:pb-0 sm:pr-6">
                  <p className="stat-rotulo">Destaque</p>
                  <p className="font-display text-xl font-semibold mt-1.5">{best.dimension}</p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="font-display text-4xl font-semibold text-spot-success tabular">{best.index}%</span>
                    <ClassificationBadge label={best.classification.label} colorToken={best.classification.colorToken} />
                  </div>
                </div>
              )}
              {worst && (
                <div className="pt-5 sm:pt-0 sm:pl-6">
                  <p className="stat-rotulo">Ponto de atenção</p>
                  <p className="font-display text-xl font-semibold mt-1.5">{worst.dimension}</p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="font-display text-4xl font-semibold text-spot-danger tabular">{worst.index}%</span>
                    <ClassificationBadge label={worst.classification.label} colorToken={worst.classification.colorToken} />
                  </div>
                </div>
              )}
            </div>
          </Secao>

          {results.insights.length > 0 && (
            <Secao indice="02" titulo="Leitura da pesquisa">
              <ul className="flex flex-col">
                {results.insights.map((insight, i) => (
                  <li key={i} className="flex gap-4 py-3 border-b border-spot-gray-200 last:border-b-0 text-sm text-spot-gray-800">
                    <span aria-hidden className="font-mono text-[11px] text-spot-gray-500 pt-0.5 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {insight}
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </>
      )}
    </div>
  );
}
