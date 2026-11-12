'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/apiClient';
import { WordCloud } from '@/components/charts/WordCloud';
import { Secao } from '@/components/ui/Secao';
import type { CommentAnalysis } from '@/lib/results';
import { ErrorState, LiveStatus, SkeletonTable } from '@/components/async';

interface SurveyOption { id: string; name: string; status: string; }

function CommentsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [surveyId, setSurveyId] = useState<string | null>(params.get('survey'));
  const [comments, setComments] = useState<CommentAnalysis | null>(null);
  const [showWordCloud, setShowWordCloud] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    apiFetch<{ surveys: SurveyOption[] }>('/api/admin/surveys')
      .then((d) => {
        if (!vivo) return;
        setSurveys(d.surveys);
        setError(null);
        if (!surveyId && d.surveys.length > 0) setSurveyId(d.surveys[0].id);
        if (d.surveys.length === 0) setLoading(false);
      })
      .catch((e) => {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : 'Erro ao carregar as pesquisas.');
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
    apiFetch<{ comments: CommentAnalysis }>(`/api/admin/surveys/${surveyId}/results`)
      .then((d) => { if (vivo) setComments(d.comments); })
      .catch((e) => {
        if (!vivo) return;
        // Os comentários da pesquisa anterior saem da tela: o seletor já mostra
        // outro nome, e deixar o texto antigo ali é atribuir comentário à
        // pesquisa errada.
        setComments(null);
        setError(e instanceof Error ? e.message : 'Erro ao carregar os comentários.');
      })
      .finally(() => { if (vivo) setLoading(false); });
    // Caminho relativo e query preservada — mesma correcao de /admin/results:
    // fixar o caminho arrastava o navegador para fora de onde o componente
    // estivesse montado, e apagava qualquer outro parametro da URL.
    const query = new URLSearchParams(Array.from(params.entries()));
    query.set('survey', surveyId);
    router.replace(`${pathname}?${query.toString()}`);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, tentativa]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Comentários</h1>
          <p className="text-spot-gray-500 text-sm">
            Respostas abertas, agrupadas por tema. Nenhuma informação de quem respondeu é exibida.
          </p>
        </div>
        <select
          className="input w-full sm:!w-auto"
          value={surveyId ?? ''}
          onChange={(e) => setSurveyId(e.target.value)}
          disabled={surveys.length === 0}
        >
          {surveys.length === 0 && <option value="">{error ? 'Erro ao carregar' : 'Carregando...'}</option>}
          {surveys.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Erro antes de vazio: uma falha de API não pode virar "nenhum
          comentário registrado". */}
      {error ? (
        <ErrorState message={error} onRetry={() => setTentativa((t) => t + 1)} />
      ) : loading ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <LiveStatus>Carregando os comentários...</LiveStatus>
          <SkeletonTable rows={6} cols={2} />
        </div>
      ) : !comments ? (
        <div className="border-y border-spot-gray-200 text-center py-14 text-spot-gray-500">Selecione uma pesquisa.</div>
      ) : comments.locked ? (
        <div className="border-l-[3px] border-spot-warning bg-spot-white py-4 px-4">
          <p className="font-semibold mb-1">Comentários indisponíveis</p>
          <p className="text-sm text-spot-gray-700">{comments.lockedReason}</p>
        </div>
      ) : comments.totalComments === 0 ? (
        <div className="border-y border-spot-gray-200 text-center py-14 text-spot-gray-500">Nenhum comentário registrado nesta pesquisa.</div>
      ) : (
        <>
          {comments.verbatimHidden && (
            <div className="bg-spot-white border-l-[3px] border-spot-warning py-4 px-4">
              <p className="font-semibold mb-1">Comentários ocultados para preservar o anonimato</p>
              <p className="text-sm text-spot-gray-700">
                Apenas {comments.commentRespondents}{' '}
                {comments.commentRespondents === 1 ? 'pessoa comentou' : 'pessoas comentaram'} nesta pesquisa — abaixo do
                mínimo de {comments.anonymityThreshold} exigido para exibir texto escrito. Com poucos comentários é
                possível reconhecer quem escreveu — e até a contagem por tema e classificação diria o que aquela pessoa escreveu.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Secao indice="01" titulo="Por tema" nota={`${comments.totalComments} comentários no total.`}>
              <Contagem itens={comments.byTheme.map((t) => ({ rotulo: t.theme, valor: t.count }))} />
            </Secao>
            <Secao indice="02" titulo="Por classificação">
              <Contagem itens={comments.bySentiment.map((x) => ({ rotulo: x.sentiment, valor: x.count }))} />
            </Secao>
            <Secao indice="03" titulo="Nuvem de palavras">
              <div className="flex items-center justify-end mb-3 -mt-1">
                <label className="flex items-center gap-1.5 text-xs text-spot-gray-500">
                  <input type="checkbox" checked={showWordCloud} onChange={(e) => setShowWordCloud(e.target.checked)} className="accent-spot-black" />
                  Ativa
                </label>
              </div>
              {showWordCloud ? <WordCloud words={comments.wordCloud} /> : <p className="text-sm text-spot-gray-500">Desativada.</p>}
            </Secao>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <CommentColumn indice="04" title="Principais elogios" items={comments.examples.elogios} />
            <CommentColumn indice="05" title="Principais reclamações" items={comments.examples.reclamacoes} />
            <CommentColumn indice="06" title="Principais sugestões" items={comments.examples.sugestoes} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Bloco de comentários — o mesmo desenho de seção do resto do painel.
 *
 * O título era colorido (verde para elogio, vermelho para reclamação): cor
 * como único portador de significado, e nenhuma das três tinha sido medida.
 * O rótulo já diz o que é; a cor não acrescentava informação nenhuma.
 */
function CommentColumn({ indice, title, items }: { indice: string; title: string; items: string[] }) {
  return (
    <Secao indice={indice} titulo={title}>
      {items.length === 0 ? (
        <p className="text-sm text-spot-gray-500">Nenhum registrado.</p>
      ) : (
        <ul className="flex flex-col gap-4 text-sm text-spot-gray-700">
          {items.map((c, i) => (
            <li key={i} className="border-l-2 border-spot-yellow pl-3 italic">
              &ldquo;{c}&rdquo;
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

/** Lista de contagem: rótulo à esquerda, número tabular à direita. */
function Contagem({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  return (
    <ul className="flex flex-col text-sm">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex justify-between gap-4 py-2.5 border-b border-spot-gray-200 last:border-b-0">
          <span>{i.rotulo}</span>
          <span className="font-mono text-spot-gray-800 tabular">{i.valor}</span>
        </li>
      ))}
    </ul>
  );
}



export default function CommentsPage() {
  return (
    <Suspense fallback={<p className="text-spot-gray-500">Carregando...</p>}>
      <CommentsInner />
    </Suspense>
  );
}
