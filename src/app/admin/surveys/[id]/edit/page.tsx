'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { ActionButton, ErrorState, LiveStatus, SkeletonForm, useAsyncAction, useConfirm, useToast } from '@/components/async';
import { QuestionModal, type Dimension, type QuestionSubmitPayload } from '@/components/admin/QuestionModal';
import { QuestionListEditor, type QuestionListItem } from '@/components/admin/QuestionListEditor';
import { ImportQuestionsPanel } from '@/components/admin/ImportQuestionsPanel';

interface Survey { id: string; name: string; status: string; }

export default function EditSurveyQuestionsPage() {
  const { id } = useParams<{ id: string }>();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<QuestionListItem | 'new' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState<string | null>(null);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);

  const load = useCallback(async () => {
    const [surveyData, dims] = await Promise.all([
      apiFetch<{ survey: Survey; questions: QuestionListItem[] }>(`/api/admin/surveys/${id}`),
      apiFetch<{ dimensions: Dimension[] }>('/api/admin/dimensions'),
    ]);
    setSurvey(surveyData.survey);
    setQuestions(surveyData.questions);
    setDimensions(dims.dimensions);
  }, [id]);

  const carregar = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    load()
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Erro ao carregar a pesquisa.'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { carregar(); }, [carregar]);

  const deactivate = async (q: QuestionListItem) => {
    if (!(await confirmar({ titulo: 'Remover esta pergunta?', texto: `“${q.text.length > 90 ? `${q.text.slice(0, 90)}…` : q.text}”`, acao: 'Remover pergunta' }))) return;
    const ok = await acao.run(() => apiFetch(`/api/admin/questions/${q.id}`, { method: 'DELETE' }), q.id);
    if (ok === undefined) return;
    mostrar('Pergunta removida.');
    await load();
  };

  /**
   * Reordenar: otimista, porque é só uma troca de posição na lista e o
   * rollback devolve exatamente a ordem anterior. Sem isto, a seta só mexia a
   * pergunta DEPOIS de duas chamadas + recarga — no meio disso a pessoa
   * clicava de novo e trocava a errada.
   */
  const reorder = async (q: QuestionListItem, swapWith: QuestionListItem) => {
    const anterior = questions;
    setQuestions((prev) =>
      prev
        .map((x) => (x.id === q.id ? { ...x, order: swapWith.order } : x.id === swapWith.id ? { ...x, order: q.order } : x))
        .sort((a, b) => a.order - b.order));
    const ok = await acao.run(async () => {
      await Promise.all([
        apiFetch(`/api/admin/questions/${q.id}`, { method: 'PATCH', body: JSON.stringify({ order: swapWith.order }) }),
        apiFetch(`/api/admin/questions/${swapWith.id}`, { method: 'PATCH', body: JSON.stringify({ order: q.order }) }),
      ]);
      return true;
    }, q.id);
    if (ok === undefined) { setQuestions(anterior); return; }
    await load();
  };

  const submitQuestion = async (payload: QuestionSubmitPayload) => {
    const editando = editing && editing !== 'new' ? editing : null;
    const ok = await acao.run(async () => {
      if (editando) await apiFetch(`/api/admin/questions/${editando.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await apiFetch(`/api/admin/surveys/${id}/questions`, { method: 'POST', body: JSON.stringify(payload) });
      return true;
    }, 'pergunta');
    if (ok === undefined) return;
    setEditing(null);
    mostrar(editando ? 'Pergunta atualizada.' : 'Pergunta adicionada.');
    await load();
  };

  const saveAsTemplate = async (name: string) => {
    setSavingTemplate(true);
    setTemplateSaved(null);
    setError(null);
    try {
      await apiFetch(`/api/admin/surveys/${id}/save-as-template`, { method: 'POST', body: JSON.stringify({ name }) });
      setShowSaveAsTemplate(false);
      setTemplateSaved(`Modelo "${name}" criado com sucesso.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar como modelo.');
    } finally {
      setSavingTemplate(false);
    }
  };

  if (loading) {
    return (
      <div aria-busy="true">
        <LiveStatus>Carregando as perguntas...</LiveStatus>
        <SkeletonForm campos={4} />
      </div>
    );
  }
  // Erro ANTES de "não encontrada": uma falha de rede dizia que a pesquisa não
  // existia, e o RH ia procurar um registro que estava lá o tempo todo.
  if (loadError) return <ErrorState message={loadError} onRetry={carregar} />;
  if (!survey) return <p className="card text-center py-10 text-spot-gray-500">Pesquisa não encontrada.</p>;

  const canEdit = survey.status === 'DRAFT' || survey.status === 'SCHEDULED';

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin/surveys" className="text-sm text-spot-gray-500 hover:underline">
            ← Pesquisas
          </Link>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">{survey.name}</h1>
          <p className="text-spot-gray-500 text-sm">{questions.length} pergunta(s)</p>
        </div>
        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn-ghost" disabled={questions.length === 0} onClick={() => setShowSaveAsTemplate(true)}>
              Salvar como modelo
            </button>
            <button className="btn-ghost" onClick={() => setShowImport((v) => !v)}>
              {showImport ? 'Ocultar importação' : 'Importar Excel'}
            </button>
            <button className="btn-primary" onClick={() => setEditing('new')}>
              + Nova pergunta
            </button>
          </div>
        )}
      </div>

      {!canEdit && (
        <p className="text-sm bg-spot-white text-spot-gray-800 border-l-[3px] border-spot-warning px-4 py-3">
          Esta pesquisa não está mais em rascunho — as perguntas não podem ser alteradas para preservar a
          integridade dos resultados já coletados.
        </p>
      )}
      {error && <p className="text-sm text-spot-danger">{error}</p>}
      {templateSaved && <p className="text-sm text-spot-success">{templateSaved}</p>}

      {canEdit && showImport && (
        <ImportQuestionsPanel
          previewUrl={`/api/admin/surveys/${id}/import/preview`}
          confirmUrl={`/api/admin/surveys/${id}/import/confirm`}
          onImported={load}
        />
      )}

      {questions.length === 0 && canEdit ? (
        <div className="card text-center py-10 text-spot-gray-500">
          <p className="mb-3">Esta pesquisa ainda não tem perguntas.</p>
          <p className="text-sm">
            Use <Link href="/admin/templates" className="underline">um modelo pronto</Link> ao criar a próxima
            pesquisa, importe uma planilha Excel, ou adicione perguntas manualmente.
          </p>
        </div>
      ) : (
        <QuestionListEditor
          questions={questions}
          canEdit={canEdit}
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

      {showSaveAsTemplate && (
        <SaveAsTemplateModal
          defaultName={survey ? `Modelo - ${survey.name}` : ''}
          saving={savingTemplate}
          error={error}
          onClose={() => { setShowSaveAsTemplate(false); setError(null); }}
          onSave={saveAsTemplate}
        />
      )}
    </div>
  );
}

function SaveAsTemplateModal({
  defaultName, saving, error, onClose, onSave,
}: { defaultName: string; saving: boolean; error: string | null; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(defaultName);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab seguia pelo conteudo coberto atras. */}
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Salvar a pesquisa como modelo"
        className="bg-spot-white rounded-xl2 max-w-md w-full p-6 flex flex-col gap-4 modal-panel"
      >
        <h2 className="font-display text-xl font-semibold">Salvar como modelo</h2>
        <div>
          <label className="block">
            <span className="label">Nome do novo modelo</span>
            <input required autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-sm text-spot-danger">{error}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}
