'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { QuestionModal, type Dimension, type QuestionSubmitPayload } from '@/components/admin/QuestionModal';
import { QuestionListEditor, type QuestionListItem } from '@/components/admin/QuestionListEditor';
import { ImportQuestionsPanel } from '@/components/admin/ImportQuestionsPanel';
import { ErrorState, LiveStatus, SkeletonForm, useAsyncAction, useConfirm, useToast, ForbiddenState, ehSemAcesso } from '@/components/async';

interface Template { id: string; name: string; }

export default function EditTemplateQuestionsPage() {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<Template | null>(null);
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<QuestionListItem | 'new' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadForbidden, setLoadForbidden] = useState(false);
  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const load = useCallback(async () => {
    const [templateData, dims] = await Promise.all([
      apiFetch<{ template: Template; questions: QuestionListItem[] }>(`/api/admin/templates/${id}`),
      apiFetch<{ dimensions: Dimension[] }>('/api/admin/dimensions'),
    ]);
    setTemplate(templateData.template);
    setQuestions(templateData.questions);
    setDimensions(dims.dimensions);
  }, [id]);

  const carregar = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setLoadForbidden(false);
    load()
      .catch((e) => { setLoadForbidden(ehSemAcesso(e)); setLoadError(e instanceof Error ? e.message : 'Erro ao carregar o modelo.'); })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { carregar(); }, [carregar]);

  const deactivate = async (q: QuestionListItem) => {
    if (!(await confirmar({ titulo: 'Remover esta pergunta?', texto: `“${q.text.length > 90 ? `${q.text.slice(0, 90)}…` : q.text}”`, acao: 'Remover pergunta' }))) return;
    try {
      await apiFetch(`/api/admin/template-questions/${q.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover pergunta.');
    }
  };

  /** Otimista: é uma troca de posição, e o rollback devolve a ordem anterior. */
  const reorder = async (q: QuestionListItem, swapWith: QuestionListItem) => {
    const anterior = questions;
    setQuestions((prev) =>
      prev
        .map((x) => (x.id === q.id ? { ...x, order: swapWith.order } : x.id === swapWith.id ? { ...x, order: q.order } : x))
        .sort((a, b) => a.order - b.order));
    setError(null);
    try {
      await Promise.all([
        apiFetch(`/api/admin/template-questions/${q.id}`, { method: 'PATCH', body: JSON.stringify({ order: swapWith.order }) }),
        apiFetch(`/api/admin/template-questions/${swapWith.id}`, { method: 'PATCH', body: JSON.stringify({ order: q.order }) }),
      ]);
      await load();
    } catch (e) {
      setQuestions(anterior);
      setError(e instanceof Error ? e.message : 'Erro ao reordenar pergunta.');
    }
  };

  const submitQuestion = async (payload: QuestionSubmitPayload) => {
    const editando = editing && editing !== 'new' ? editing : null;
    const ok = await acao.run(async () => {
      if (editando) await apiFetch(`/api/admin/template-questions/${editando.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await apiFetch(`/api/admin/templates/${id}/questions`, { method: 'POST', body: JSON.stringify(payload) });
      return true;
    }, 'pergunta');
    if (ok === undefined) return;
    setEditing(null);
    mostrar(editando ? 'Pergunta atualizada.' : 'Pergunta adicionada.');
    await load();
  };

  if (loading) {
    return (
      <div aria-busy="true">
        <LiveStatus>Carregando as perguntas do modelo...</LiveStatus>
        <SkeletonForm campos={4} />
      </div>
    );
  }
  // Erro antes de "não encontrado": uma falha de rede não pode se passar por
  // registro inexistente.
  if (loadError) return loadForbidden ? <ForbiddenState /> : <ErrorState message={loadError} onRetry={carregar} />;
  if (!template) return <p className="card text-center py-10 text-spot-gray-500">Modelo não encontrado.</p>;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin/templates" className="text-sm text-spot-gray-500 hover:underline">
            ← Modelos
          </Link>
          <h1 className="titulo-pagina">{template.name}</h1>
          <p className="text-spot-gray-500 text-sm">{questions.length} pergunta(s)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-ghost" onClick={() => setShowImport((v) => !v)}>
            {showImport ? 'Ocultar importação' : 'Importar Excel'}
          </button>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            + Nova pergunta
          </button>
        </div>
      </div>

      {(error ?? acao.error) && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">
          {error ?? acao.error}
        </p>
      )}

      {showImport && (
        <ImportQuestionsPanel
          previewUrl={`/api/admin/templates/${id}/import/preview`}
          confirmUrl={`/api/admin/templates/${id}/import/confirm`}
          onImported={load}
        />
      )}

      {questions.length === 0 ? (
        <div className="card text-center py-10 text-spot-gray-500">
          Este modelo ainda não tem perguntas. Adicione manualmente ou importe uma planilha Excel.
        </div>
      ) : (
        <QuestionListEditor
          questions={questions}
          canEdit
          onEdit={(q) => setEditing(q)}
          onReorder={reorder}
          onDelete={deactivate}
        />
      )}

      {editing && (
        <QuestionModal
          dimensions={dimensions}
          question={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={submitQuestion}
        />
      )}
    </div>
  );
}
