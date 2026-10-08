'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncAction, useAsyncData, useConfirm, useToast,
} from '@/components/async';

interface Dimension { id: string; name: string; }
interface Sector { id: string; name: string; inSurvey: boolean; }
interface Unit { id: string; name: string; }
interface Survey { id: string; name: string; }
interface ActionPlan {
  id: string; problem: string; action: string; owner: string; priority: string; status: string;
  dueDate: string | null; notes: string | null; createdAt: string; completedAt: string | null;
  surveyId: string | null; survey: Survey | null; dimensionId: string | null; dimension: Dimension | null;
  sectorId: string | null; sector: Sector | null; unitId: string | null; unit: Unit | null;
}

const PRIORITY_LABEL: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
/*
 * Reaproveita as cinco classes da escala do sistema (`.badge-*` em
 * globals.css): rótulo escrito + ponto na cor, sem fundo pastel. É a mesma
 * escala do mapa de calor e da classificação de clima — o sistema inteiro
 * passa a ter UMA família de cores, em vez de uma por tela.
 */
const PRIORITY_BADGE: Record<string, string> = {
  LOW: 'badge-good', MEDIUM: 'badge-attention',
  HIGH: 'badge-critical', CRITICAL: 'badge-very-critical',
};
const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Não iniciado', IN_PROGRESS: 'Em andamento', DONE: 'Concluído', CANCELLED: 'Cancelado',
};

export default function ActionPlansPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ActionPlan | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  // Vindo de "Criar plano de ação" nos resultados: abre o formulário já preenchido.
  useEffect(() => {
    const r = lerRascunhoDaUrl();
    if (r) { setRascunho(r); setShowForm(true); }
  }, []);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [view, setView] = useState<'list' | 'matrix'>('list');

  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const { data, loading, reloading, error: loadError, reload, setData } = useAsyncData(
    async (signal) => {
      const [pl, dim, sec, uni, sur] = await Promise.all([
        apiFetch<{ actionPlans: ActionPlan[] }>('/api/admin/action-plans', { signal }),
        apiFetch<{ dimensions: Dimension[] }>('/api/admin/dimensions', { signal }),
        apiFetch<{ sectors: Sector[] }>('/api/admin/sectors', { signal }),
        apiFetch<{ units: Unit[] }>('/api/admin/units', { signal }),
        apiFetch<{ surveys: Survey[] }>('/api/admin/surveys', { signal }),
      ]);
      return {
        plans: pl.actionPlans,
        dimensions: dim.dimensions,
        // Plano de ação nasce do resultado da pesquisa: só setores da pesquisa.
        sectors: sec.sectors.filter((s) => s.inSurvey),
        units: uni.units,
        surveys: sur.surveys,
      };
    },
    [],
    { mensagemPadrao: 'Erro ao carregar os planos de ação.' },
  );
  const plans = data?.plans ?? [];
  const dimensions = data?.dimensions ?? [];
  const sectors = data?.sectors ?? [];
  const units = data?.units ?? [];
  const surveys = data?.surveys ?? [];

  /**
   * Mudar o status é otimista: o `select` é controlado por `p.status`, então
   * sem isto a escolha da pessoa VOLTAVA sozinha para o valor antigo até a
   * recarga chegar — parecia que o sistema tinha ignorado o clique. Se a rota
   * recusar, a lista inteira é restaurada como estava.
   */
  const updateStatus = async (plan: ActionPlan, status: string) => {
    if (!data) return;
    const anterior = data;
    setData({ ...data, plans: plans.map((x) => (x.id === plan.id ? { ...x, status } : x)) });
    const ok = await acao.run(
      () => apiFetch(`/api/admin/action-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      plan.id,
    );
    if (ok === undefined) { setData(anterior); return; }
    await reload();
  };

  const remove = async (p: ActionPlan) => {
    if (!(await confirmar({ titulo: `Excluir o plano de ação "${p.problem}"?`, acao: 'Excluir plano', perigo: true }))) return;
    const ok = await acao.run(
      () => apiFetch(`/api/admin/action-plans/${p.id}`, { method: 'DELETE' }),
      p.id,
    );
    if (ok === undefined) return;
    mostrar('Plano de ação excluído.');
    await reload();
  };

  const isOverdue = (p: ActionPlan) => p.dueDate && p.status !== 'DONE' && p.status !== 'CANCELLED' && new Date(p.dueDate) < new Date();

  const filtered = plans.filter((p) => statusFilter === 'Todos' || p.status === statusFilter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Plano de Ação</h1>
          <p className="text-spot-gray-500 text-sm">Ações criadas a partir dos resultados da pesquisa de clima.</p>
        </div>
        <div className="flex gap-2">
          {/* Alternancia de visao: qual esta ativa so aparecia pelo fundo. */}
          <div className="flex rounded-btn border border-spot-gray-300 p-1 text-sm" role="group" aria-label="Forma de ver os planos">
            <button
              type="button"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={`px-4 min-h-11 rounded-btn ${view === 'list' ? 'bg-spot-black text-spot-onBlack' : ''}`}
            >
              Lista
            </button>
            <button
              type="button"
              aria-pressed={view === 'matrix'}
              onClick={() => setView('matrix')}
              className={`px-4 min-h-11 rounded-btn ${view === 'matrix' ? 'bg-spot-black text-spot-onBlack' : ''}`}
            >
              Matriz
            </button>
          </div>
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Novo plano</button>
        </div>
      </div>

      <RefreshingBar visible={reloading} />
      {acao.error && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">
          {acao.error}
        </p>
      )}

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={reload}
        retrying={reloading}
        rotulo="os planos de ação"
        skeleton={<SkeletonCardList rows={4} />}
        empty={plans.length === 0}
        emptyState={<EmptyState>Nenhum plano de ação criado ainda.</EmptyState>}
      >
      {view === 'matrix' ? (
        <PriorityMatrix plans={plans} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por situação">
            {['Todos', 'NOT_STARTED', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                className={`badge min-h-11 ${statusFilter === s ? 'bg-spot-black text-spot-onBlack' : 'bg-spot-gray-100 text-spot-gray-600'}`}
              >
                {s === 'Todos' ? 'Todos' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState>Nenhum plano de ação com este status.</EmptyState>
          ) : (
            <div className="[&>*:last-child]:border-b-0 border-t border-spot-gray-300">
              {filtered.map((p) => (
                /* O atraso era um anel vermelho em volta do card inteiro; virou
                   marcação na lateral, que se vê de relance percorrendo a lista
                   sem transformar o item num objeto destacado. */
                <div
                  key={p.id}
                  className={`py-4 border-b border-spot-gray-200 ${
                    isOverdue(p) ? 'border-l-[3px] border-l-spot-danger -ml-3 pl-3' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex gap-2 items-center mb-1 flex-wrap">
                        <span className={`badge ${PRIORITY_BADGE[p.priority]}`}>{PRIORITY_LABEL[p.priority]}</span>
                        {p.dimension && <span className="badge bg-spot-gray-100 text-spot-gray-600">{p.dimension.name}</span>}
                        {p.sector && <span className="badge bg-spot-gray-100 text-spot-gray-600">{p.sector.name}</span>}
                        {p.unit && <span className="badge bg-spot-gray-100 text-spot-gray-600">{p.unit.name}</span>}
                        {isOverdue(p) && <span className="badge badge-very-critical">Atrasado</span>}
                      </div>
                      <p className="font-semibold">{p.problem}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={p.status}
                        onChange={(e) => updateStatus(p, e.target.value)}
                        disabled={acao.isPending(p.id)}
                        /* Um <select> sem rotulo, repetido por plano: o leitor
                           de tela anunciava so o valor atual ("Em andamento,
                           caixa de combinacao") sem dizer de qual plano. */
                        aria-label={`Situação do plano "${p.problem}"`}
                        className="input !w-auto text-xs !py-1.5"
                      >
                        {Object.entries(STATUS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <button
                        className="btn-ghost text-xs py-1.5 px-3"
                        onClick={() => setEditingPlan(p)}
                        disabled={acao.isPending(p.id)}
                        aria-label={`Editar o plano de ação "${p.problem}"`}
                      >
                        Editar
                      </button>
                      <ActionButton
                        className="btn-ghost text-xs py-1.5 px-3 text-spot-danger"
                        pending={acao.isPending(p.id)}
                        pendingLabel="Excluindo..."
                        onClick={() => remove(p)}
                        aria-label={`Excluir o plano de ação "${p.problem}"`}
                      >
                        Excluir
                      </ActionButton>
                    </div>
                  </div>
                  <p className="text-sm text-spot-gray-700 mb-2">{p.action}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-spot-gray-500">
                    <span>Responsável: {p.owner}</span>
                    {p.dueDate && <span>Prazo: {new Date(p.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>}
                    {p.survey && <span>Pesquisa: {p.survey.name}</span>}
                  </div>
                  {p.notes && <p className="text-xs text-spot-gray-500 mt-2 italic">{p.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </AsyncSection>

      {showForm && data && (
        <ActionPlanForm
          rascunho={rascunho}
          dimensions={dimensions}
          sectors={sectors}
          units={units}
          surveys={surveys}
          onClose={() => { setShowForm(false); setRascunho(null); }}
          onSaved={async () => {
            setShowForm(false);
            setRascunho(null);
            mostrar('Plano de ação criado.');
            await reload();
          }}
        />
      )}

      {editingPlan && (
        <ActionPlanForm
          plan={editingPlan}
          dimensions={dimensions}
          sectors={sectors}
          units={units}
          surveys={surveys}
          onClose={() => setEditingPlan(null)}
          onSaved={async () => {
            setEditingPlan(null);
            mostrar('Plano de ação atualizado.');
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** Matriz Impacto x Resultado: prioridade (impacto) no eixo Y, favorabilidade da dimensão afetada no eixo X (quando disponível). */
function PriorityMatrix({ plans }: { plans: ActionPlan[] }) {
  const active = plans.filter((p) => p.status !== 'DONE' && p.status !== 'CANCELLED');
  const quadrant = (p: ActionPlan) => {
    const highImpact = p.priority === 'HIGH' || p.priority === 'CRITICAL';
    // Sem o índice exato da dimensão aqui (evita nova chamada), usamos prioridade como proxy de "resultado baixo".
    const lowResult = p.priority === 'CRITICAL' || p.priority === 'HIGH';
    if (highImpact && lowResult) return 'Prioridade máxima';
    if (highImpact && !lowResult) return 'Planejar';
    if (!highImpact && lowResult) return 'Monitorar';
    return 'Manter';
  };
  const groups: Record<string, ActionPlan[]> = { 'Prioridade máxima': [], 'Planejar': [], 'Monitorar': [], 'Manter': [] };
  for (const p of active) groups[quadrant(p)].push(p);

  /*
   * Os quatro quadrantes eram retângulos pastel inteiros. Numa matriz, o
   * fundo colorido compete com o único conteúdo que importa — a lista de
   * problemas dentro dele. Ficou a marcação na lateral, na cor da escala do
   * projeto, e o quadrante volta a ser papel.
   */
  const QUADRANT_STYLE: Record<string, string> = {
    'Prioridade máxima': 'border-spot-danger',
    'Planejar': 'border-spot-warning',
    'Monitorar': 'border-spot-gray-400',
    'Manter': 'border-spot-success',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Object.entries(groups).map(([label, items]) => (
        <div key={label} className={`bg-spot-white border-l-[3px] py-4 px-4 ${QUADRANT_STYLE[label]}`}>
          <p className="font-display text-lg font-semibold mb-3">
            {label} <span className="font-sans font-normal text-sm text-spot-gray-500 tabular">({items.length})</span>
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {items.map((p) => (
              <li key={p.id} className="bg-spot-white/70 rounded-lg px-3 py-2">{p.problem}</li>
            ))}
            {items.length === 0 && <li className="text-spot-gray-500">Nenhum plano.</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Rascunho vindo de "Criar plano de ação" nos resultados (ver lerRascunhoDaUrl). */
interface Rascunho {
  problem?: string;
  action?: string;
  priority?: string;
  dimensionId?: string;
  surveyId?: string;
}

/**
 * Lê o rascunho do link dos resultados (?novo=1&pesquisa=..&dimensao=..) e
 * tira os parâmetros da barra de endereço — recarregar a página não abre o
 * formulário de novo.
 */
function lerRascunhoDaUrl(): Rascunho | null {
  const p = new URLSearchParams(window.location.search);
  if (p.get('novo') !== '1') return null;
  window.history.replaceState(null, '', window.location.pathname);
  const prioridade = p.get('prioridade') ?? '';
  return {
    problem: p.get('problema')?.slice(0, 500) ?? undefined,
    action: p.get('acao')?.slice(0, 1000) ?? undefined,
    priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(prioridade) ? prioridade : undefined,
    dimensionId: p.get('dimensao') ?? undefined,
    surveyId: p.get('pesquisa') ?? undefined,
  };
}

function ActionPlanForm({
  plan, rascunho, dimensions, sectors, units, surveys, onClose, onSaved,
}: { plan?: ActionPlan; rascunho?: Rascunho | null; dimensions: Dimension[]; sectors: Sector[]; units: Unit[]; surveys: Survey[]; onClose: () => void; onSaved: () => void }) {
  const [problem, setProblem] = useState(plan?.problem ?? rascunho?.problem ?? '');
  const [action, setAction] = useState(plan?.action ?? rascunho?.action ?? '');
  const [owner, setOwner] = useState(plan?.owner ?? '');
  const [priority, setPriority] = useState(plan?.priority ?? rascunho?.priority ?? 'MEDIUM');
  const [dueDate, setDueDate] = useState(plan?.dueDate ? plan.dueDate.slice(0, 10) : '');
  const [dimensionId, setDimensionId] = useState(plan?.dimensionId ?? rascunho?.dimensionId ?? '');
  const [sectorId, setSectorId] = useState(plan?.sectorId ?? '');
  const [unitId, setUnitId] = useState(plan?.unitId ?? '');
  const [surveyId, setSurveyId] = useState(plan?.surveyId ?? rascunho?.surveyId ?? '');
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        problem, action, owner, priority, notes: notes || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        dimensionId: dimensionId || undefined, sectorId: sectorId || undefined, unitId: unitId || undefined, surveyId: surveyId || undefined,
      };
      if (plan) {
        await apiFetch(`/api/admin/action-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/admin/action-plans', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar plano.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab seguia pelo conteudo coberto atras. */}
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={plan ? 'Editar plano de ação' : 'Novo plano de ação'}
        className="bg-spot-white rounded-xl2 max-w-lg w-full p-6 flex flex-col gap-4 my-8 modal-panel"
      >
        <h2 className="font-display text-xl font-semibold">{plan ? 'Editar plano de ação' : 'Novo plano de ação'}</h2>
        <div>
          <label className="block">
            <span className="label">Problema identificado</span>
            <textarea required className="input" value={problem} onChange={(e) => setProblem(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Ação proposta</span>
            <textarea required className="input" value={action} onChange={(e) => setAction(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block">
              <span className="label">Responsável</span>
              <input required className="input" value={owner} onChange={(e) => setOwner(e.target.value)} />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">Prioridade</span>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block">
              <span className="label">Dimensão</span>
              <select className="input" value={dimensionId} onChange={(e) => setDimensionId(e.target.value)}>
                <option value="">—</option>
                {dimensions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">Setor</span>
              <select className="input" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
                <option value="">Todos</option>
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block">
              <span className="label">Unidade</span>
              <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Todas</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">Prazo</span>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">Pesquisa relacionada</span>
              <select className="input" value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
                <option value="">—</option>
                {surveys.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div>
          <label className="block">
            <span className="label">Observações</span>
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
