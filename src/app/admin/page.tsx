'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { motion } from 'motion/react';
import { StatCard, ClassificationBadge } from '@/components/StatCard';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { Secao } from '@/components/ui/Secao';
import { Cascata, Surge } from '@/components/ui/Cascata';
import { NumeroRolante } from '@/components/ui/NumeroRolante';
import { ErrorState, LiveStatus, RefreshingBar, Skeleton, SkeletonStats, SkeletonTable } from '@/components/async';
import type { SurveyResultsSummary } from '@/lib/results';
import { SystemNotices } from '@/components/admin/SystemNotices';
import { Icone } from '@/components/ui/Icone';
import { IndexBarChart, FavorabilityDonut } from '@/components/charts/Charts';

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
      <SystemNotices />
      <CabecalhoPagina
        titulo="Visão Geral"
        subtitulo="Clima organizacional da pesquisa em foco."
        acao={
          <Link href={`/admin/results?survey=${survey.id}`} className="btn-secondary">
            Abrir resultado completo
          </Link>
        }
      />

      <div className="card flex flex-wrap items-center justify-between gap-3 !py-4">
        <div className="min-w-0 flex-1">
          <p className="stat-rotulo">Pesquisa em foco</p>
          {allSurveys.length > 1 ? (
            <select
              className="input !w-auto font-sans font-extrabold text-lg tracking-tight !py-1.5 mt-1"
              value={survey.id}
              onChange={(e) => switchSurvey(e.target.value)}
            >
              {allSurveys.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <p className="font-sans font-extrabold text-xl tracking-tight mt-0.5">{survey.name}</p>
          )}
        </div>
        <RefreshingBar visible={switching && !!results} texto="Carregando os resultados..." />
        <span className="badge badge-good">{STATUS_LABEL[survey.status]}</span>
      </div>

      {/* Primeira carga sem números ainda: esqueleto com a forma dos cartões,
          em vez de uma linha de texto que deixa a página saltando de altura.
          Na troca de pesquisa os números da anterior ficam na tela, apagados,
          e rolam até os novos quando chegam — ver NumeroRolante. */}
      {switching && !results && (
        <div aria-busy="true" className="flex flex-col gap-6">
          <LiveStatus>Carregando os resultados da pesquisa...</LiveStatus>
          <SkeletonStats cards={4} />
          <SkeletonTable rows={4} cols={3} />
        </div>
      )}

      {resultsError && !switching && (
        <ErrorState message={resultsError} onRetry={() => loadResultsFor(survey)} />
      )}

      {/* Entrada orquestrada (ver Cascata): os indicadores um a um, depois os
          gráficos se desenhando, as duas pontas e a leitura. Toca uma vez, na
          montagem; trocar de pesquisa não repete a entrada. */}
      {results && (
        <Cascata
          raiz
          aria-busy={switching}
          className={`flex flex-col gap-10 transition-opacity duration-200 ${switching ? 'opacity-60' : ''}`}
        >
          <Cascata className="stat-regua" passo={0.05}>
            {/* O indicador de destaque entra como o cartão do título do login:
                carimbado. Os outros deslizam, como os textos da capa. */}
            <Surge className="grid" como="carimbo">
              <StatCard destaque icone="clima" label="Índice de Clima" value={`${results.climateIndex}%`} sub={results.climateClassification.label} />
            </Surge>
            <Surge className="grid">
              <StatCard
                icone="participacao"
                label="Participação"
                value={`${results.participationRate}%`}
                sub={`${results.totalResponses} / ${results.eligiblePopulation ?? '—'} colaboradores`}
              />
            </Surge>
            <Surge className="grid">
              <StatCard icone="respostas" label="Total de respostas" value={String(results.totalResponses)} sub={results.participationClassification} />
            </Surge>
            <Surge className="grid">
              <StatCard icone="plano" label="Planos de ação pendentes" value={String(pendingActions)} sub="Não iniciados ou em andamento" />
            </Surge>
          </Cascata>

          {/* Os dois gráficos que respondem "como estamos?" logo na entrada. Com
              a pesquisa travada por anonimato (`locked`), `byDimension` vem
              vazio e os blocos somem em vez de desenhar eixos sem dado. */}
          {results.byDimension.length > 0 && (
            <Surge className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <Secao
                className="xl:col-span-3"
                indice="01"
                titulo="Resultado por dimensão"
                apoio="Índice de 0 a 100%"
                acao={
                  <Link href={`/admin/results?survey=${survey.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-spot-gray-900 underline decoration-spot-yellow decoration-2 underline-offset-4 min-h-11">
                    Ver detalhes <Icone nome="seta" className="h-4 w-4" />
                  </Link>
                }
              >
                <IndexBarChart data={results.byDimension.map((d) => ({ name: d.dimension, index: d.index }))} />
              </Secao>
              <Secao className="xl:col-span-2" indice="02" titulo="Favorável × Neutro × Desfavorável">
                <FavorabilityDonut {...results.favorability} />
              </Secao>
            </Surge>
          )}

          {/* As duas pontas da pesquisa lado a lado: a dimensão que melhor
              foi e a que pior foi. Cada ponta é um cartão com filete de cor
              no topo; as cores saem da MESMA escala do mapa de calor
              (#0F7A3D = 5.42:1 e #C93A3A = 5.06:1 sobre branco). O filete se
              preenche da esquerda para a direita quando o cartão chega. */}
          {(best || worst) && (
            <Surge className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {best && (
                <div className="card relative overflow-hidden !border-t-spot-gray-200">
                  <Filete className="bg-spot-success" />
                  <p className="stat-rotulo">Destaque</p>
                  <p className="voz text-[1.75rem] leading-tight mt-1.5">{best.dimension}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
                    <span className="font-sans text-6xl font-extrabold tracking-[-0.05em] leading-[0.85] text-spot-success tabular"><NumeroRolante valor={`${best.index}%`} /></span>
                    <ClassificationBadge label={best.classification.label} colorToken={best.classification.colorToken} />
                  </div>
                </div>
              )}
              {worst && (
                <div className="card relative overflow-hidden !border-t-spot-gray-200">
                  <Filete className="bg-spot-danger" />
                  <p className="stat-rotulo">Ponto de atenção</p>
                  <p className="voz text-[1.75rem] leading-tight mt-1.5">{worst.dimension}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
                    <span className="font-sans text-6xl font-extrabold tracking-[-0.05em] leading-[0.85] text-spot-danger tabular"><NumeroRolante valor={`${worst.index}%`} /></span>
                    <ClassificationBadge label={worst.classification.label} colorToken={worst.classification.colorToken} />
                  </div>
                </div>
              )}
            </Surge>
          )}

          {results.insights.length > 0 && (
            <Surge>
            <Secao indice="03" titulo="Leitura da pesquisa">
              <ul className="flex flex-col">
                {results.insights.map((insight, i) => (
                  <li key={i} className="flex gap-4 py-3 border-b border-dashed border-spot-gray-300 last:border-b-0 text-sm text-spot-gray-800">
                    <span aria-hidden className="secao-indice pt-0.5">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {insight}
                  </li>
                ))}
              </ul>
            </Secao>
            </Surge>
          )}
        </Cascata>
      )}
    </div>
  );
}

/**
 * Filete de cor no topo do cartão das pontas. Escala de 0 a 1 na horizontal
 * (transform, não largura) quando o `<Surge>` em volta chega — herda a vez da
 * cascata pelos nomes `oculto`/`visivel`.
 */
function Filete({ className }: { className: string }) {
  return (
    <motion.span
      aria-hidden
      className={`absolute inset-x-0 top-0 h-[3px] origin-left ${className}`}
      variants={{
        oculto: { scaleX: 0 },
        // Como a régua ao lado do rótulo na capa do login: desenha-se da
        // esquerda logo depois que o cartão chega.
        visivel: { scaleX: 1, transition: { delay: 0.2, duration: 0.45, ease: 'easeOut' } },
      }}
    />
  );
}
