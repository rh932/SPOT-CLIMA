'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/apiClient';
import { StatCard, ClassificationBadge } from '@/components/StatCard';
import { ReguaIndicadores, Secao } from '@/components/ui/Secao';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { IndexBarChart, FavorabilityDonut, DimensionRadar } from '@/components/charts/Charts';
import { Heatmap } from '@/components/charts/Heatmap';
import { WordCloud } from '@/components/charts/WordCloud';
import { EnpsPanel } from '@/components/admin/EnpsPanel';
import type { SurveyResultsSummary, CommentAnalysis } from '@/lib/results';
import { ErrorState, LiveStatus, SkeletonStats, SkeletonTable } from '@/components/async';
import Link from 'next/link';

/**
 * Link para o Plano de Ação com o formulário já preenchido a partir de uma
 * recomendação (pesquisa, dimensão, problema e a 1ª sugestão como ação).
 * Abaixo de 50% a prioridade já sugere "Crítica".
 */
function linkPlanoDeAcao(results: SurveyResultsSummary, r: SurveyResultsSummary['recommendations'][number]): string {
  const dim = results.byDimension.find((d) => d.dimension === r.dimension);
  const p = new URLSearchParams({
    novo: '1',
    pesquisa: results.surveyId,
    problema: `${r.dimension} com índice de ${r.index}% na pesquisa "${results.surveyName}".`,
    acao: r.suggestions[0] ?? '',
    prioridade: r.index < 50 ? 'CRITICAL' : 'HIGH',
  });
  if (dim) p.set('dimensao', dim.dimensionId);
  return `/admin/action-plans?${p.toString()}`;
}

interface SurveyOption { id: string; name: string; status: string; }

function ResultsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [surveyId, setSurveyId] = useState<string | null>(params.get('survey'));
  const [results, setResults] = useState<SurveyResultsSummary | null>(null);
  const [comments, setComments] = useState<CommentAnalysis | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>('Todos');
  const [unitFilter, setUnitFilter] = useState<string>('Todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listaErro, setListaErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    apiFetch<{ surveys: SurveyOption[] }>('/api/admin/surveys')
      .then((d) => {
        if (!vivo) return;
        setSurveys(d.surveys);
        setListaErro(null);
        if (!surveyId && d.surveys.length > 0) {
          // Encerrada primeiro: é a que tem números liberados (aberta só mostra participação).
          const preferred = d.surveys.find((s) => s.status === 'CLOSED') ?? d.surveys.find((s) => s.status === 'OPEN') ?? d.surveys[0];
          setSurveyId(preferred.id);
        }
        if (d.surveys.length === 0) setLoading(false);
      })
      .catch((e) => {
        if (!vivo) return;
        // Sem este catch o seletor ficava vazio e a tela presa em "Carregando"
        // para sempre — sem nenhuma pista de que a lista é que falhou.
        setListaErro(e instanceof Error ? e.message : 'Erro ao carregar as pesquisas.');
        setLoading(false);
      });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tentativa]);

  useEffect(() => {
    if (!surveyId) return;
    let vivo = true;
    setLoading(true);
    setError(null);
    apiFetch<{ results: SurveyResultsSummary; comments: CommentAnalysis }>(`/api/admin/surveys/${surveyId}/results`)
      .then((d) => {
        if (!vivo) return;
        setResults(d.results);
        setComments(d.comments);
      })
      .catch((e) => {
        if (!vivo) return;
        // Os números da pesquisa ANTERIOR saem da tela: com o seletor já
        // mostrando outro nome, manter os gráficos antigos é pior que não
        // mostrar nada.
        setResults(null);
        setComments(null);
        setError(e instanceof Error ? e.message : 'Erro ao carregar os resultados.');
      })
      .finally(() => { if (vivo) setLoading(false); });
    /*
     * Escreve a pesquisa escolhida na URL (o link fica compartilhavel) sem
     * fixar o caminho nem apagar o resto da query.
     *
     * Antes era `router.replace('/admin/results?survey=' + surveyId)`, que
     * tinha dois problemas: descartava qualquer outro parametro da URL, e
     * mandava o navegador para um caminho fixo mesmo quando o componente
     * estava montado em outra rota — era o que tirava a tela da bancada de
     * auditoria e caia no login.
     */
    const query = new URLSearchParams(Array.from(params.entries()));
    query.set('survey', surveyId);
    router.replace(`${pathname}?${query.toString()}`);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, tentativa]);

  const sectorOptions = ['Todos', ...(results?.bySector.map((s) => s.sector) ?? [])];
  const filteredHeatmap = results?.heatmap.filter((c) => sectorFilter === 'Todos' || c.sector === sectorFilter) ?? [];
  const filteredSectors = results?.bySector.filter((s) => sectorFilter === 'Todos' || s.sector === sectorFilter) ?? [];

  const unitOptions = ['Todos', ...(results?.byUnit.map((u) => u.unit) ?? [])];
  const filteredUnits = results?.byUnit.filter((u) => unitFilter === 'Todos' || u.unit === unitFilter) ?? [];
  const filteredUnitHeatmap = (results?.unitHeatmap.filter((c) => unitFilter === 'Todos' || c.unit === unitFilter) ?? []).map((c) => ({
    sectorId: c.unitId,
    sector: c.unit,
    dimensionId: c.dimensionId,
    dimension: c.dimension,
    index: c.index,
    visible: c.visible,
  }));

  return (
    <div className="flex flex-col gap-10">
      <CabecalhoPagina titulo="Resultados" subtitulo="Indicadores consolidados por pesquisa." />

      {/* Os três filtros da tela ficam numa faixa própria, sob uma régua:
          antes dividiam a linha do título e, no celular, empurravam o nome
          da página para fora da primeira dobra. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-y border-spot-gray-300 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 shrink-0">Recorte</p>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <select
            className="input w-full sm:!w-auto"
            value={surveyId ?? ''}
            onChange={(e) => setSurveyId(e.target.value)}
            disabled={surveys.length === 0}
          >
            {surveys.length === 0 && <option value="">{listaErro ? 'Erro ao carregar' : 'Carregando...'}</option>}
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="input w-full sm:!w-auto" value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
            {sectorOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="input w-full sm:!w-auto" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            {unitOptions.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Erro ANTES de vazio e de carregando — era a inversão que fazia uma
          falha de API se passar por "pesquisa sem respostas". */}
      {listaErro ? (
        <ErrorState message={listaErro} onRetry={() => setTentativa((t) => t + 1)} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setTentativa((t) => t + 1)} />
      ) : loading ? (
        <div aria-busy="true" className="flex flex-col gap-6">
          <LiveStatus>Carregando os resultados...</LiveStatus>
          <SkeletonStats cards={4} />
          <SkeletonTable rows={6} cols={4} />
        </div>
      ) : !results ? (
        <div className="border-y border-spot-gray-200 text-center py-14 text-spot-gray-500">Selecione uma pesquisa.</div>
      ) : results.totalResponses === 0 ? (
        <div className="border-y border-spot-gray-200 text-center py-14 text-spot-gray-500">Esta pesquisa ainda não recebeu respostas.</div>
      ) : results.locked ? (
        // A trava vem do servidor (src/lib/results.ts): nenhum número chega
        // ao navegador, então não há o que esconder aqui — só explicar.
        <div className="flex flex-col gap-6">
          <ReguaIndicadores>
            <StatCard
              label="Participação"
              value={`${results.participationRate}%`}
              sub={`${results.totalResponses} ${results.totalResponses === 1 ? 'resposta' : 'respostas'} até agora`}
            />
          </ReguaIndicadores>
          <div className="border-l-[3px] border-spot-warning bg-spot-white py-4 px-4">
            <p className="font-semibold mb-1">
              {results.locked === 'SURVEY_OPEN' ? 'Resultados liberados no encerramento' : 'Respostas insuficientes para exibir resultados'}
            </p>
            <p className="text-sm text-spot-gray-700">{results.lockedReason}</p>
          </div>
        </div>
      ) : (
        <>
          {results.excludedQuestions > 0 && (
            <p className="text-xs text-spot-gray-500 -mt-4">
              {results.excludedQuestions === 1 ? '1 pergunta ficou' : `${results.excludedQuestions} perguntas ficaram`} fora
              dos números por ter menos de {results.anonymityThreshold} pessoas respondendo.
            </p>
          )}

          <ReguaIndicadores>
            <StatCard label="Índice de Clima" value={`${results.climateIndex}%`} sub={results.climateClassification.label} />
            <StatCard label="Participação" value={`${results.participationRate}%`} sub={`${results.totalResponses} respostas · ${results.participationClassification}`} />
            <StatCard label="Favorável" value={`${results.favorability.favorable}%`} sub={`Neutro ${results.favorability.neutral}% · Desfav. ${results.favorability.unfavorable}%`} />
            <StatCard label="Desvio padrão" value={String(results.standardDeviation)} sub="Dispersão das respostas Likert" />
          </ReguaIndicadores>

          {results.enps && <EnpsPanel enps={results.enps} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Secao indice="01" titulo="Resultado por dimensão">
              <IndexBarChart data={results.byDimension.map((d) => ({ name: d.dimension, index: d.index }))} />
            </Secao>
            <Secao indice="02" titulo="Favorável × Neutro × Desfavorável">
              <FavorabilityDonut {...results.favorability} />
            </Secao>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Secao indice="03" titulo="Radar de dimensões">
              <DimensionRadar data={results.byDimension.map((d) => ({ dimension: d.dimension, index: d.index }))} />
            </Secao>
            <Secao indice="04" titulo="Resultado por setor">
              {filteredSectors.length > 0 ? (
                <IndexBarChart
                  data={filteredSectors.map((s) => ({ name: s.sector, index: s.index ?? 0, hidden: !s.visible }))}
                />
              ) : (
                <p className="text-sm text-spot-gray-500">Sem dados.</p>
              )}
              {filteredSectors.some((s) => !s.visible) && (
                <p className="text-xs text-spot-gray-500 mt-2">
                  Setores ocultos aparecem como 0 e não têm o valor divulgado: têm menos de{' '}
                  {results.anonymityThreshold} respostas, ou foram ocultados junto para que o total não revele os menores.
                </p>
              )}
            </Secao>
          </div>

          <Secao
            indice="05"
            titulo="Mapa de calor — Setor × Dimensão"
            nota={`Células cinzas (—) estão ocultas para preservar o anonimato: têm menos de ${results.anonymityThreshold} respostas, ou saíram junto para que o total da dimensão não revele as menores.`}
          >
            <Heatmap cells={filteredHeatmap} />
          </Secao>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Secao indice="06" titulo="Resultado por unidade">
              {filteredUnits.length > 0 ? (
                <IndexBarChart
                  data={filteredUnits.map((u) => ({ name: u.unit, index: u.index ?? 0, hidden: !u.visible }))}
                />
              ) : (
                <p className="text-sm text-spot-gray-500">Sem dados.</p>
              )}
              {filteredUnits.some((u) => !u.visible) && (
                <p className="text-xs text-spot-gray-500 mt-2">
                  Unidades ocultas aparecem como 0 e não têm o valor divulgado: têm menos de{' '}
                  {results.anonymityThreshold} respostas, ou foram ocultadas junto para que o total não revele as menores.
                </p>
              )}
            </Secao>
            <Secao
              indice="07"
              titulo="Mapa de calor — Unidade × Dimensão"
              nota={`Células cinzas (—) estão ocultas para preservar o anonimato: têm menos de ${results.anonymityThreshold} respostas, ou saíram junto para que o total da dimensão não revele as menores.`}
            >
              <Heatmap cells={filteredUnitHeatmap} rowLabel="Unidade" />
            </Secao>
          </div>

          {/* As cores saem da escala do mapa de calor, não do Tailwind cru:
              #0F7A3D dá 5.42:1 e #C93A3A 5.06:1 sobre branco — o emerald-700
              e o red-700 de antes nunca tinham sido medidos contra nada. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Secao indice="08" titulo="Top pontos fortes">
              <ol className="flex flex-col">
                {results.topStrengths.map((q, i) => (
                  <li key={q.questionId} className="flex justify-between gap-4 py-2.5 border-b border-spot-gray-200 last:border-b-0 text-sm">
                    <span className="text-spot-gray-800">
                      <span aria-hidden className="font-mono text-[11px] text-spot-gray-500 mr-2">{String(i + 1).padStart(2, '0')}</span>
                      {q.text}
                    </span>
                    <span className="font-display font-semibold text-spot-success shrink-0 tabular">{q.favorable}%</span>
                  </li>
                ))}
              </ol>
            </Secao>
            <Secao indice="09" titulo="Pontos de atenção">
              <ol className="flex flex-col">
                {results.topCritical.map((q, i) => (
                  <li key={q.questionId} className="flex justify-between gap-4 py-2.5 border-b border-spot-gray-200 last:border-b-0 text-sm">
                    <span className="text-spot-gray-800">
                      <span aria-hidden className="font-mono text-[11px] text-spot-gray-500 mr-2">{String(i + 1).padStart(2, '0')}</span>
                      {q.text}
                    </span>
                    <span className="font-display font-semibold text-spot-danger shrink-0 tabular">{q.favorable}%</span>
                  </li>
                ))}
              </ol>
            </Secao>
          </div>

          <Secao indice="10" titulo="Resultado detalhado por dimensão">
            <div className="overflow-x-auto">
              <table className="tabela min-w-[600px]">
                <thead>
                  <tr>
                    <th className="pr-3">Dimensão</th>
                    <th className="pr-3">Média</th>
                    <th className="pr-3">Favorável</th>
                    <th className="pr-3">Neutro</th>
                    <th className="pr-3">Desfavorável</th>
                    <th className="pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.byDimension.map((d) => (
                    <tr key={d.dimensionId}>
                      <td className="pr-3 font-medium">{d.dimension}</td>
                      <td className="pr-3 tabular">{d.average}</td>
                      <td className="pr-3 tabular">{d.favorable}%</td>
                      <td className="pr-3 tabular">{d.neutral}%</td>
                      <td className="pr-3 tabular">{d.unfavorable}%</td>
                      <td className="pr-3">
                        <ClassificationBadge label={d.classification.label} colorToken={d.classification.colorToken} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>

          {results.recommendations.length > 0 && (
            <Secao
              indice="11"
              titulo="Recomendações automáticas"
              nota="Geradas quando uma dimensão fica abaixo de 65%. São sugestões — cabe ao RH decidir o que vira Plano de Ação."
            >
              <div className="flex flex-col">
                {results.recommendations.map((r) => (
                  <div key={r.dimension} className="py-4 border-b border-spot-gray-200 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-display text-lg font-semibold">
                        {r.dimension} <span className="text-spot-gray-500 tabular">{r.index}%</span>
                      </p>
                      <Link
                        href={linkPlanoDeAcao(results, r)}
                        className="btn-ghost text-xs py-1.5 px-3"
                        aria-label={`Criar plano de ação para ${r.dimension}`}
                      >
                        Criar plano de ação
                      </Link>
                    </div>
                    <ul className="text-sm text-spot-gray-700 mt-1.5 flex flex-col gap-1">
                      {r.suggestions.map((sugestao, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span aria-hidden className="text-spot-yellowDark">—</span>
                          {sugestao}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          {comments && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Secao indice="12" titulo="Comentários por tema" nota={`${comments.totalComments} no total.`}>
                {comments.byTheme.length === 0 ? (
                  <p className="text-sm text-spot-gray-500">Nenhum comentário registrado.</p>
                ) : (
                  <ul className="flex flex-col text-sm">
                    {comments.byTheme.map((t) => (
                      <li key={t.theme} className="flex justify-between gap-4 py-2.5 border-b border-spot-gray-200 last:border-b-0">
                        <span>{t.theme}</span>
                        <span className="font-mono text-spot-gray-800 tabular">{t.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Secao>
              <Secao indice="13" titulo="Nuvem de palavras">
                <WordCloud words={comments.wordCloud} />
              </Secao>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="text-spot-gray-500">Carregando...</p>}>
      <ResultsInner />
    </Suspense>
  );
}
