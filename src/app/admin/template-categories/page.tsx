'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncAction, useAsyncData, useToast,
} from '@/components/async';

interface Category { id: string; name: string; order: number; active: boolean; }

export default function TemplateCategoriesPage() {
  const { data, loading, reloading, error, forbidden, reload, setData } = useAsyncData(
    (signal) => apiFetch<{ categories: Category[] }>('/api/admin/template-categories', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar as categorias.' },
  );
  const categories = data?.categories ?? [];
  const acao = useAsyncAction();
  const { mostrar } = useToast();

  const [newName, setNewName] = useState('');
  const [criando, setCriando] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (criando) return;
    setCriando(true);
    setCreateError(null);
    try {
      await apiFetch('/api/admin/template-categories', {
        method: 'POST',
        body: JSON.stringify({ name: newName, order: categories.length + 1 }),
      });
      setNewName('');
      await reload();
      mostrar('Categoria adicionada.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar categoria.');
    } finally {
      setCriando(false);
    }
  };

  /** Otimista com rollback — ver o comentário equivalente em Unidades. */
  const toggleActive = async (c: Category) => {
    const anterior = categories;
    setData({ categories: categories.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)) });
    const ok = await acao.run(async () => {
      if (c.active) await apiFetch(`/api/admin/template-categories/${c.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/admin/template-categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
      return true;
    }, c.id);
    if (!ok) { setData({ categories: anterior }); return; }
    mostrar(c.active ? `"${c.name}" desativada.` : `"${c.name}" reativada.`);
    await reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Categorias de Modelo</h1>
        <p className="text-spot-gray-500 text-sm">
          Agrupam os modelos na Biblioteca de Modelos (ex.: Engajamento, Clima organizacional, Liderança).
        </p>
      </div>

      <RefreshingBar visible={reloading} />
      {acao.error && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">
          {acao.error}
        </p>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="as categorias"
        skeleton={<SkeletonCardList rows={3} comBadge={false} />}
        empty={categories.length === 0}
        emptyState={<EmptyState>Nenhuma categoria cadastrada. Use o campo abaixo para criar a primeira.</EmptyState>}
      >
        <div className="[&>*:last-child]:border-b-0">
          {[...categories].sort((a, b) => a.order - b.order).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3.5 border-b border-spot-gray-200">
              <span className={c.active ? '' : 'text-spot-gray-500 line-through'}>{c.name}</span>
              <ActionButton
                className="btn-ghost text-xs py-1.5 px-3"
                pending={acao.isPending(c.id)}
                onClick={() => toggleActive(c)}
                aria-label={
                  c.active
                    ? `Desativar a categoria "${c.name}"`
                    : `Reativar a categoria "${c.name}"`
                }
              >
                {c.active ? 'Desativar' : 'Reativar'}
              </ActionButton>
            </div>
          ))}
        </div>
      </AsyncSection>

      <form onSubmit={create} className="card flex gap-3 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="nova-categoria">Nova categoria</label>
          <input id="nova-categoria" className="input" required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Engajamento" disabled={criando} />
        </div>
        <ActionButton type="submit" pending={criando} pendingLabel="Adicionando...">Adicionar</ActionButton>
      </form>
      {createError && <p role="alert" className="text-sm text-spot-danger">{createError}</p>}
    </div>
  );
}
