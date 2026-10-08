'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncAction, useAsyncData, useConfirm, useToast,
} from '@/components/async';

interface Dimension { id: string; name: string; description: string | null; order: number; active: boolean; }

export default function DimensionsPage() {
  const { data, loading, reloading, error, reload, setData } = useAsyncData(
    (signal) => apiFetch<{ dimensions: Dimension[] }>('/api/admin/dimensions', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar as dimensões.' },
  );
  const dimensions = data?.dimensions ?? [];
  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [criando, setCriando] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (criando) return;
    setCriando(true);
    setCreateError(null);
    try {
      await apiFetch('/api/admin/dimensions', {
        method: 'POST',
        body: JSON.stringify({ name: newName, description: newDesc || undefined, order: dimensions.length + 1 }),
      });
      setNewName('');
      setNewDesc('');
      await reload();
      mostrar('Dimensão adicionada.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar dimensão.');
    } finally {
      setCriando(false);
    }
  };

  /** Otimista com rollback — ver o comentário equivalente em Unidades. */
  const toggleActive = async (d: Dimension) => {
    const anterior = dimensions;
    setData({ dimensions: dimensions.map((x) => (x.id === d.id ? { ...x, active: !x.active } : x)) });
    const ok = await acao.run(async () => {
      if (d.active) await apiFetch(`/api/admin/dimensions/${d.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/admin/dimensions/${d.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
      return true;
    }, d.id);
    if (!ok) { setData({ dimensions: anterior }); return; }
    mostrar(d.active ? `"${d.name}" desativada.` : `"${d.name}" reativada.`);
    await reload();
  };

  const remove = async (d: Dimension) => {
    if (!(await confirmar({ titulo: `Excluir a dimensão "${d.name}"?`, acao: 'Excluir dimensão', perigo: true }))) return;
    const ok = await acao.run(async () => {
      await apiFetch(`/api/admin/dimensions/${d.id}?hard=true`, { method: 'DELETE' });
      return true;
    }, d.id);
    if (!ok) return;
    mostrar(`"${d.name}" excluída.`);
    await reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Dimensões</h1>
        <p className="text-spot-gray-500 text-sm">Categorias usadas para organizar as perguntas e os indicadores.</p>
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
        onRetry={reload}
        retrying={reloading}
        rotulo="as dimensões"
        skeleton={<SkeletonCardList rows={4} comBadge={false} />}
        empty={dimensions.length === 0}
        emptyState={<EmptyState>Nenhuma dimensão cadastrada. Use o formulário abaixo para criar a primeira.</EmptyState>}
      >
        <div className="[&>*:last-child]:border-b-0">
          {[...dimensions].sort((a, b) => a.order - b.order).map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-3.5 border-b border-spot-gray-200">
              <div className={d.active ? '' : 'text-spot-gray-500'}>
                <p className={`flex items-center gap-2 ${d.active ? 'font-medium' : 'font-medium line-through'}`}>
                  {d.name}
                  {!d.active && <span className="badge bg-spot-gray-100 text-spot-gray-500 no-underline">Inativo</span>}
                </p>
                {d.description && <p className="text-xs text-spot-gray-500">{d.description}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3"
                  pending={acao.isPending(d.id)}
                  onClick={() => toggleActive(d)}
                  aria-label={
                    d.active
                      ? `Desativar a dimensão "${d.name}" — sai das novas perguntas`
                      : `Reativar a dimensão "${d.name}"`
                  }
                >
                  {d.active ? 'Desativar' : 'Reativar'}
                </ActionButton>
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3 text-spot-danger"
                  pending={acao.isPending(d.id)}
                  pendingLabel="Excluindo..."
                  onClick={() => remove(d)}
                  aria-label={`Excluir a dimensão "${d.name}" definitivamente`}
                >
                  Excluir
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      </AsyncSection>

      <form onSubmit={create} className="card flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="nova-dimensao">Nova dimensão</label>
          <input id="nova-dimensao" className="input" required value={newName} onChange={(e) => setNewName(e.target.value)} disabled={criando} />
        </div>
        <div>
          <label className="label" htmlFor="nova-dimensao-desc">Descrição (opcional)</label>
          <input id="nova-dimensao-desc" className="input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} disabled={criando} />
        </div>
        <ActionButton type="submit" className="btn-primary self-start" pending={criando} pendingLabel="Adicionando...">
          Adicionar
        </ActionButton>
      </form>
      {createError && <p role="alert" className="text-sm text-spot-danger">{createError}</p>}
    </div>
  );
}
