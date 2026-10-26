'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { EvolutionLineChart } from '@/components/charts/Charts';
import {
  ActionButton, AsyncSection, EmptyState, ErrorState, SkeletonCardList, SkeletonTable,
  useAsyncData,
} from '@/components/async';

interface SurveyOption { id: string; name: string; status: string; createdAt: string; }
interface ComparisonResponse {
  overallSeries: { surveyId: string; surveyName: string; index: number; enps: number | null }[];
  byDimension: { dimension: string; series: { surveyId: string; surveyName: string; index: number | null }[]; delta: number | null; trend: 'up' | 'down' | 'stable' | null }[];
}

const TREND_LABEL: Record<string, string> = { up: 'Melhorou', down: 'Piorou', stable: 'Estável' };
const TREND_COLOR: Record<string, string> = { up: 'text-spot-success', down: 'text-spot-danger', stable: 'text-spot-gray-500' };

export default function ComparisonsPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparando, setComparando] = useState(false);
  const [jaComparou, setJaComparou] = useState(false);

  const { data, loading, error: loadError, forbidden, reload } = useAsyncData(
    (signal) => apiFetch<{ surveys: SurveyOption[] }>('/api/admin/surveys', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar as pesquisas.' },
  );

  const surveys = useMemo(
    () => [...(data?.surveys ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [data],
  );

  // Pré-seleção das três últimas: só quando a lista chega, e só uma vez.
  const preSelecionado = useRef(false);
  useEffect(() => {
    if (preSelecionado.current || surveys.length === 0) return;
    preSelecionado.current = true;
    // Só encerradas: pesquisa aberta não tem resultado liberado (anonimato).
    const fechadas = surveys.filter((s) => s.status === 'CLOSED' || s.status === 'ARCHIVED');
    setSelected(fechadas.slice(-3).map((s) => s.id));
  }, [surveys]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /**
   * O comparativo é a única ação da tela e podia demorar segundos.
   *
   * Antes: sem estado de pendência e sem `catch`. Clicar em "Comparar" numa
   * rede lenta não mudava NADA na tela, e numa falha a promessa morria no
   * console — a tela ficava com o comparativo anterior (ou vazia) para sempre.
   */
  const compare = async () => {
    if (selected.length < 2) {
      setError('Selecione ao menos duas pesquisas.');
      return;
    }
    if (comparando) return;
    setError(null);
    setComparando(true);
    try {
      const resultado = await apiFetch<ComparisonResponse>(`/api/admin/comparisons?ids=${selected.join(',')}`);
      setComparison(resultado);
      setJaComparou(true);
    } catch (e) {
      // O comparativo antigo sai da tela: deixá-lo ali, com outras pesquisas
      // marcadas, faria o RH ler números que não são os que ele pediu.
      setComparison(null);
      setError(e instanceof Error ? e.message : 'Não foi possível montar o comparativo.');
    } finally {
      setComparando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Comparativos</h1>
        <p className="text-spot-gray-500 text-sm">Evolução do clima entre diferentes ciclos de pesquisa.</p>
      </div>

      <AsyncSection
        loading={loading}
        error={loadError}
        forbidden={forbidden}
        onRetry={reload}
        rotulo="as pesquisas"
        skeleton={<SkeletonCardList rows={2} comBadge={false} />}
        empty={surveys.length === 0}
        emptyState={<EmptyState>Nenhuma pesquisa para comparar ainda.</EmptyState>}
      >
        <div className="flex flex-col gap-6">
          <div className="card">
            <p className="font-semibold mb-3" id="rotulo-comparativo">Selecione as pesquisas (ordem cronológica)</p>
            <p className="sr-only" role="status" aria-live="polite">
              {selected.length === 0
                ? 'Nenhuma pesquisa selecionada.'
                : `${selected.length} pesquisa(s) selecionada(s).`}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="rotulo-comparativo">
              {surveys.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  /* Selecao MULTIPLA que so se via pelo fundo escuro: nada
                     anunciava quais pesquisas entrariam no comparativo, e o
                     botao "Comparar" recusa com menos de duas. */
                  aria-pressed={selected.includes(s.id)}
                  aria-label={`${s.name}${selected.includes(s.id) ? ' — incluída no comparativo' : ' — incluir no comparativo'}`}
                  onClick={() => toggle(s.id)}
                  className={`badge min-h-11 ${selected.includes(s.id) ? 'bg-spot-black text-spot-onBlack' : 'bg-spot-gray-100 text-spot-gray-600'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            {error && <p role="alert" className="text-sm text-spot-danger mt-3">{error}</p>}
            <ActionButton
              className="btn-primary mt-4"
              pending={comparando}
              pendingLabel="Comparando..."
              onClick={compare}
            >
              Comparar
            </ActionButton>
          </div>

          {/* Esqueleto com a forma do resultado: dois blocos de gráfico/tabela. */}
          {comparando && (
            <div aria-busy="true" className="flex flex-col gap-6">
              <SkeletonTable rows={3} cols={3} />
              <SkeletonTable rows={5} cols={4} />
            </div>
          )}

          {!comparando && jaComparou && !comparison && !error && (
            <ErrorState message="O comparativo voltou vazio." onRetry={compare} />
          )}

          {comparison && !comparando && (
            <>
              <div className="card">
                <p className="font-semibold mb-3">Evolução do índice de clima geral</p>
                <EvolutionLineChart data={comparison.overallSeries} lines={[{ key: 'index', label: 'Índice de Clima' }]} />
              </div>

              {comparison.overallSeries.some((s) => s.enps !== null) && (
                <div className="card">
                  <p className="font-semibold mb-1">eNPS por ciclo</p>
                  <p className="text-xs text-spot-gray-500 mb-3">
                    % promotores − % detratores (−100 a +100). &quot;—&quot; quando o ciclo não teve a pergunta ou ficou abaixo do limite de anonimato.
                  </p>
                  <dl className="flex flex-wrap gap-3">
                    {comparison.overallSeries.map((s) => (
                      <div key={s.surveyId} className="bg-spot-gray-50 px-4 py-3 min-w-[9rem]">
                        <dt className="text-xs text-spot-gray-500">{s.surveyName}</dt>
                        <dd className="font-display text-2xl font-semibold tabular-nums">
                          {s.enps === null ? '—' : s.enps > 0 ? `+${s.enps}` : s.enps}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="card">
                <p className="font-semibold mb-3">Evolução por dimensão</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200">
                        <th className="py-2 pr-3">Dimensão</th>
                        {comparison.overallSeries.map((s) => (
                          <th key={s.surveyId} className="py-2 pr-3">{s.surveyName}</th>
                        ))}
                        <th className="py-2 pr-3">Evolução</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.byDimension.map((d) => (
                        <tr key={d.dimension} className="border-b border-spot-gray-100">
                          <td className="py-2 pr-3 font-medium">{d.dimension}</td>
                          {d.series.map((s, i) => (
                            <td key={i} className="py-2 pr-3">{s.index !== null ? `${s.index}%` : '—'}</td>
                          ))}
                          <td className={`py-2 pr-3 font-semibold ${d.trend ? TREND_COLOR[d.trend] : ''}`}>
                            {d.delta !== null ? `${d.delta > 0 ? '+' : ''}${d.delta} p.p. (${TREND_LABEL[d.trend ?? 'stable']})` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </AsyncSection>
    </div>
  );
}
