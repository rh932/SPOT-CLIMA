'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncAction, useAsyncData, useConfirm, useToast,
} from '@/components/async';

interface Unit { id: string; name: string; order: number; active: boolean; }

export default function UnitsPage() {
  const { data, loading, reloading, error, forbidden, reload, setData } = useAsyncData(
    (signal) => apiFetch<{ units: Unit[] }>('/api/admin/units', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar as unidades.' },
  );
  const units = data?.units ?? [];
  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const [newName, setNewName] = useState('');
  const [criando, setCriando] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (criando) return;
    setCriando(true);
    setCreateError(null);
    try {
      await apiFetch('/api/admin/units', { method: 'POST', body: JSON.stringify({ name: newName, order: units.length + 1 }) });
      setNewName('');
      await reload();
      mostrar('Unidade adicionada.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar unidade.');
    } finally {
      setCriando(false);
    }
  };

  /**
   * Otimista: ativar/desativar é só um booleano, então a lista muda na hora e
   * volta sozinha se a rota recusar. Antes o clique não dava sinal nenhum até a
   * recarga terminar — e, numa falha, a promessa morria no console e o item
   * continuava do jeito antigo sem nenhuma explicação.
   */
  const toggleActive = async (u: Unit) => {
    const anterior = units;
    setData({ units: units.map((x) => (x.id === u.id ? { ...x, active: !x.active } : x)) });
    const ok = await acao.run(async () => {
      if (u.active) await apiFetch(`/api/admin/units/${u.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/admin/units/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
      return true;
    }, u.id);
    if (!ok) { setData({ units: anterior }); return; }
    mostrar(u.active ? `"${u.name}" desativada.` : `"${u.name}" reativada.`);
    await reload();
  };

  const remove = async (u: Unit) => {
    if (!(await confirmar({ titulo: `Excluir a unidade "${u.name}"?`, acao: 'Excluir unidade', perigo: true }))) return;
    const ok = await acao.run(async () => {
      await apiFetch(`/api/admin/units/${u.id}?hard=true`, { method: 'DELETE' });
      return true;
    }, u.id);
    if (!ok) return;
    mostrar(`"${u.name}" excluída.`);
    await reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Unidades</h1>
        <p className="text-spot-gray-500 text-sm">
          Loja/unidade física — o colaborador seleciona junto com o setor ao responder.
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
        rotulo="as unidades"
        skeleton={<SkeletonCardList rows={3} comBadge={false} />}
        empty={units.length === 0}
        emptyState={<EmptyState>Nenhuma unidade cadastrada. Use o campo abaixo para criar a primeira.</EmptyState>}
      >
        <div className="[&>*:last-child]:border-b-0">
          {[...units].sort((a, b) => a.order - b.order).map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 py-3.5 border-b border-spot-gray-200">
              <span className={`flex items-center gap-2 ${u.active ? '' : 'text-spot-gray-500 line-through'}`}>
                {u.name}
                {!u.active && <span className="badge bg-spot-gray-100 text-spot-gray-500 no-underline">Inativo</span>}
              </span>
              <div className="flex gap-2 shrink-0">
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3"
                  pending={acao.isPending(u.id)}
                  onClick={() => toggleActive(u)}
                  aria-label={
                    u.active
                      ? `Desativar a unidade "${u.name}" — sai das novas pesquisas, os dados ficam`
                      : `Reativar a unidade "${u.name}"`
                  }
                >
                  {u.active ? 'Desativar' : 'Reativar'}
                </ActionButton>
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3 text-spot-danger"
                  pending={acao.isPending(u.id)}
                  pendingLabel="Excluindo..."
                  onClick={() => remove(u)}
                  aria-label={`Excluir a unidade "${u.name}" definitivamente`}
                >
                  Excluir
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      </AsyncSection>

      <form onSubmit={create} className="card flex gap-3 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="nova-unidade">Nova unidade</label>
          <input id="nova-unidade" className="input" required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Salão JK" disabled={criando} />
        </div>
        <ActionButton type="submit" pending={criando} pendingLabel="Adicionando...">Adicionar</ActionButton>
      </form>
      {createError && <p role="alert" className="text-sm text-spot-danger">{createError}</p>}
      <p className="text-xs text-spot-gray-500">
        &quot;Desativar&quot; remove a unidade das novas pesquisas sem apagar dados já coletados. &quot;Excluir&quot; apaga
        definitivamente — só é permitido quando a unidade não está em uso (sem respostas, planos de ação,
        funcionários ou gestores associados).
      </p>
    </div>
  );
}
