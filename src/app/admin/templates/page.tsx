'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncAction, useAsyncData, useConfirm, useToast,
} from '@/components/async';

interface Category { id: string; name: string; }
interface Template {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category: Category | null;
  active: boolean;
  questionCount: number;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [creatingSurveyFor, setCreatingSurveyFor] = useState<Template | null>(null);
  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const { data, loading, reloading, error: loadError, forbidden, reload, setData } = useAsyncData(
    async (signal) => {
      const [tpl, cat, me] = await Promise.all([
        apiFetch<{ templates: Template[] }>('/api/admin/templates', { signal }),
        apiFetch<{ categories: Category[] }>('/api/admin/template-categories', { signal }),
        // O papel é só para decidir se o botão de excluir aparece; se falhar,
        // o padrão seguro é NÃO oferecer a ação destrutiva.
        fetch('/api/auth/me', { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      return {
        templates: tpl.templates,
        categories: cat.categories,
        isSuperAdmin: me?.admin?.role === 'SUPER_ADMIN',
      };
    },
    [],
    { mensagemPadrao: 'Erro ao carregar os modelos.' },
  );
  const templates = data?.templates ?? [];
  const categories = data?.categories ?? [];
  const isSuperAdmin = data?.isSuperAdmin ?? false;
  const error = acao.error;

  const duplicate = async (t: Template) => {
    const ok = await acao.run(
      () => apiFetch(`/api/admin/templates/${t.id}/duplicate`, { method: 'POST', body: JSON.stringify({}) }),
      t.id,
    );
    if (ok === undefined) return;
    mostrar(`"${t.name}" duplicado.`);
    await reload();
  };

  /** Otimista com rollback: é um booleano, e o badge muda no clique. */
  const toggleActive = async (t: Template) => {
    if (!data) return;
    const anterior = data;
    setData({ ...data, templates: templates.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)) });
    const ok = await acao.run(async () => {
      if (t.active) await apiFetch(`/api/admin/templates/${t.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/admin/templates/${t.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
      return true;
    }, t.id);
    if (ok === undefined) { setData(anterior); return; }
    mostrar(t.active ? `"${t.name}" desativado.` : `"${t.name}" reativado.`);
    await reload();
  };

  const remove = async (t: Template) => {
    if (!(await confirmar({ titulo: `Excluir o modelo "${t.name}"?`, texto: 'As perguntas do modelo são apagadas junto. Pesquisas já criadas a partir dele não mudam.', acao: 'Excluir modelo', perigo: true }))) return;
    const ok = await acao.run(
      () => apiFetch(`/api/admin/templates/${t.id}?hard=true`, { method: 'DELETE' }),
      t.id,
    );
    if (ok === undefined) return;
    mostrar(`"${t.name}" excluído.`);
    await reload();
  };

  const grouped = new Map<string, Template[]>();
  for (const t of templates) {
    const key = t.category?.name ?? 'Sem categoria';
    grouped.set(key, [...(grouped.get(key) ?? []), t]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Biblioteca de Modelos</h1>
          <p className="text-spot-gray-500 text-sm">
            Conjuntos de perguntas reutilizáveis — use um modelo para criar uma pesquisa em segundos.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/template-categories" className="btn-ghost">Categorias</Link>
          {isSuperAdmin && <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Novo modelo</button>}
        </div>
      </div>

      {!loading && !loadError && !isSuperAdmin && (
        <p className="text-sm bg-spot-white text-spot-gray-800 border-l-[3px] border-spot-warning px-4 py-3">
          Você pode usar modelos para criar pesquisas. Criar, editar, duplicar ou desativar modelos é restrito a
          administradores Super Admin.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>
      )}

      <RefreshingBar visible={reloading} />

      <AsyncSection
        loading={loading}
        error={loadError}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="os modelos"
        skeleton={<SkeletonCardList rows={3} />}
        empty={templates.length === 0}
        emptyState={<EmptyState>Nenhum modelo cadastrado ainda.</EmptyState>}
      >
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([categoryName, items]) => (
            <div key={categoryName}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-2">{categoryName}</p>
              <div className="[&>*:last-child]:border-b-0 border-t border-spot-gray-300">
                {items.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-4 flex-wrap py-4 border-b border-spot-gray-200">
                    <div className="min-w-0">
                      <p className={`font-semibold ${t.active ? '' : 'line-through text-spot-gray-500'}`}>{t.name}</p>
                      {t.description && <p className="text-sm text-spot-gray-500">{t.description}</p>}
                      <p className="text-xs text-spot-gray-500 mt-1">{t.questionCount} pergunta(s)</p>
                    </div>
                    <div className="flex gap-2 flex-wrap w-full sm:w-auto sm:shrink-0">
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => setCreatingSurveyFor(t)}
                        aria-label={`Criar uma pesquisa a partir do modelo "${t.name}"`}
                      >
                        Criar pesquisa
                      </button>
                      {isSuperAdmin && (
                        <>
                          <Link
                            href={`/admin/templates/${t.id}/edit`}
                            className="btn-ghost text-xs py-1.5 px-3"
                            aria-label={`Editar as perguntas do modelo "${t.name}"`}
                          >
                            Editar perguntas
                          </Link>
                          <ActionButton
                            className="btn-ghost text-xs py-1.5 px-3"
                            pending={acao.isPending(t.id)}
                            pendingLabel="Duplicando..."
                            onClick={() => duplicate(t)}
                            aria-label={`Duplicar o modelo "${t.name}"`}
                          >
                            Duplicar
                          </ActionButton>
                          <ActionButton
                            className="btn-ghost text-xs py-1.5 px-3"
                            pending={acao.isPending(t.id)}
                            onClick={() => toggleActive(t)}
                            aria-label={
                              t.active
                                ? `Desativar o modelo "${t.name}" — some da lista de novas pesquisas`
                                : `Reativar o modelo "${t.name}"`
                            }
                          >
                            {t.active ? 'Desativar' : 'Reativar'}
                          </ActionButton>
                          <ActionButton
                            className="btn-ghost text-xs py-1.5 px-3 text-spot-danger"
                            pending={acao.isPending(t.id)}
                            pendingLabel="Excluindo..."
                            onClick={() => remove(t)}
                            aria-label={`Excluir o modelo "${t.name}" e as perguntas dele`}
                          >
                            Excluir
                          </ActionButton>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AsyncSection>

      {isSuperAdmin && showCreate && (
        <CreateTemplateModal
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => {
            setShowCreate(false);
            router.push(`/admin/templates/${id}/edit`);
          }}
        />
      )}

      {creatingSurveyFor && (
        <CreateSurveyFromTemplateModal
          template={creatingSurveyFor}
          onClose={() => setCreatingSurveyFor(null)}
          onCreated={(id) => router.push(`/admin/surveys/${id}/edit`)}
        />
      )}
    </div>
  );
}

function CreateTemplateModal({
  categories, onClose, onCreated,
}: { categories: Category[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{ template: { id: string } }>('/api/admin/templates', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined, categoryId: categoryId || undefined }),
      });
      onCreated(data.template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar modelo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab continuava passeando pelo conteudo
          coberto atras dele, incluindo botoes destrutivos. */}
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Novo modelo"
        className="bg-spot-white rounded-xl2 max-w-md w-full p-6 flex flex-col gap-4 modal-panel"
      >
        <h2 className="font-display text-xl font-semibold">Novo modelo</h2>
        <div>
          <label className="block">
            <span className="label">Nome do modelo</span>
            <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Descrição (opcional)</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Categoria</span>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-spot-danger">{error}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Criando...' : 'Criar e editar perguntas'}</button>
        </div>
      </form>
    </div>
  );
}

function CreateSurveyFromTemplateModal({
  template, onClose, onCreated,
}: { template: Template; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(`Pesquisa - ${template.name}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{ survey: { id: string } }>(`/api/admin/templates/${template.id}/create-survey`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      onCreated(data.survey.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar pesquisa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal). */}
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={`Criar pesquisa a partir do modelo ${template.name}`}
        className="bg-spot-white rounded-xl2 max-w-md w-full p-6 flex flex-col gap-4 modal-panel"
      >
        <h2 className="font-display text-xl font-semibold">Criar pesquisa a partir de &ldquo;{template.name}&rdquo;</h2>
        <div>
          <label className="block">
            <span className="label">Nome da pesquisa</span>
            <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-sm text-spot-danger">{error}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <ActionButton type="submit" className="btn-primary flex-1" pending={saving} pendingLabel="Criando...">
            Criar pesquisa
          </ActionButton>
        </div>
      </form>
    </div>
  );
}
