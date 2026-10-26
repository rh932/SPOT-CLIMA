'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { AsyncSection, EmptyState, RefreshingBar, SkeletonCardList, useAsyncData } from '@/components/async';
import { statusLabel } from '@/lib/probation';
import { COLOR_OPTIONS, COLOR_LABELS, type FeedbackColor } from '@/lib/feedbackCycle';
import { evaluationResult } from '@/lib/employeeTimeline';

type Period = 'FIRST' | 'SECOND' | 'FEEDBACK';

interface Lookup { id: string; name: string }
interface EvaluationRow {
  id: string;
  period: Period;
  cycleNumber: number;
  evaluationDate: string;
  classification: string;
  conclusion: string | null;
  color: FeedbackColor | null;
  source: 'SISTEMA' | 'FORMS';
  evaluatorName: string | null;
  evaluator: Lookup | null;
  employee: {
    id: string;
    fullName: string;
    roleDescription: string;
    shift: 'DIA' | 'NOITE';
    status: 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';
    isApprentice: boolean;
    sector: Lookup | null;
    unit: Lookup | null;
  } | null;
}

const PERIOD_LABEL: Record<Period, string> = {
  FIRST: '1ª avaliação (45 dias)',
  SECOND: '2ª avaliação (90 dias)',
  FEEDBACK: 'Feedback periódico',
};
const SHIFT_LABEL: Record<'DIA' | 'NOITE', string> = { DIA: 'Diurno', NOITE: 'Noturno' };
const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function titulo(r: EvaluationRow): string {
  if (r.period === 'FEEDBACK') return `${r.cycleNumber}º feedback`;
  return PERIOD_LABEL[r.period] + (r.cycleNumber > 1 ? ` · ${r.cycleNumber}ª resposta` : '');
}

/** Opções de um filtro a partir do que existe na lista, em ordem alfabética. */
function opcoes(rows: EvaluationRow[], pick: (r: EvaluationRow) => Lookup | null | undefined): Lookup[] {
  const mapa = new Map<string, string>();
  rows.forEach((r) => { const v = pick(r); if (v) mapa.set(v.id, v.name); });
  return [...mapa.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Histórico completo de avaliações — todos os colaboradores, todos os
 * avaliadores. Cada avaliação é um registro próprio e permanente: avaliar de
 * novo o mesmo colaborador acrescenta uma linha, nunca troca a anterior. O
 * toque abre a ficha do colaborador, onde está tudo o que foi registrado.
 */
export default function AdminEvaluationsHistoryPage() {
  const { data, loading, reloading, error, forbidden, reload } = useAsyncData(
    (signal) => apiFetch<{ evaluations: EvaluationRow[] }>('/api/admin/evaluations', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar o histórico de avaliações.' },
  );
  const todas = useMemo(() => data?.evaluations ?? [], [data]);

  const [busca, setBusca] = useState('');
  const [unidade, setUnidade] = useState('');
  const [setor, setSetor] = useState('');
  const [periodo, setPeriodo] = useState<Period | ''>('');
  const [avaliador, setAvaliador] = useState('');

  const unidades = useMemo(() => opcoes(todas, (r) => r.employee?.unit), [todas]);
  const setores = useMemo(() => opcoes(todas, (r) => r.employee?.sector), [todas]);
  const avaliadores = useMemo(
    () => opcoes(todas, (r) => (r.evaluator ?? (r.evaluatorName ? { id: `nome:${r.evaluatorName}`, name: r.evaluatorName } : null))),
    [todas],
  );

  const q = norm(busca.trim());
  const rows = todas.filter((r) => {
    const quem = r.evaluator?.id ?? (r.evaluatorName ? `nome:${r.evaluatorName}` : '');
    return (!q || norm(r.employee?.fullName ?? '').includes(q))
      && (!unidade || r.employee?.unit?.id === unidade)
      && (!setor || r.employee?.sector?.id === setor)
      && (!periodo || r.period === periodo)
      && (!avaliador || quem === avaliador);
  });
  const temFiltro = Boolean(busca || unidade || setor || periodo || avaliador);
  const colaboradores = new Set(rows.map((r) => r.employee?.id)).size;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Histórico de avaliações</h1>
        <p className="text-spot-gray-500 text-sm">
          Todas as avaliações de experiência e de feedback já registradas. Nenhuma é sobrescrita: cada uma fica como
          parte da evolução do colaborador.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <label className="block lg:col-span-2">
          <span className="label">Colaborador</span>
          <input type="search" className="input" placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Loja</span>
          <select className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Todas</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Setor</span>
          <select className="input" value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Todos</option>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Tipo</span>
          <select className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value as Period | '')}>
            <option value="">Todos</option>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2 lg:col-span-2">
          <span className="label">Avaliador</span>
          <select className="input" value={avaliador} onChange={(e) => setAvaliador(e.target.value)}>
            <option value="">Todos</option>
            {avaliadores.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {temFiltro && (
          <button
            type="button"
            className="btn-ghost self-end"
            onClick={() => { setBusca(''); setUnidade(''); setSetor(''); setPeriodo(''); setAvaliador(''); }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {!loading && !error && (
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-spot-gray-500">
          {rows.length} {rows.length === 1 ? 'avaliação' : 'avaliações'} · {colaboradores} {colaboradores === 1 ? 'colaborador' : 'colaboradores'}
        </p>
      )}

      <RefreshingBar visible={reloading} />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="o histórico de avaliações"
        skeleton={<SkeletonCardList rows={5} />}
        empty={rows.length === 0}
        emptyState={<EmptyState>{temFiltro ? 'Nenhuma avaliação com esses filtros.' : 'Nenhuma avaliação registrada ainda.'}</EmptyState>}
      >
        <div className="[&>*:last-child]:border-b-0 border-t border-spot-gray-300">
          {rows.map((r) => {
            const cor = r.color ? COLOR_OPTIONS.find((c) => c.value === r.color) : null;
            const quem = r.evaluator?.name ?? r.evaluatorName;
            const conteudo = (
              <>
                <div className="min-w-0">
                  <p className="font-semibold truncate group-hover:underline underline-offset-4 decoration-spot-yellow decoration-2">
                    {r.employee?.fullName ?? 'Colaborador removido'}
                  </p>
                  {r.employee && (
                    <p className="text-xs text-spot-gray-500">
                      {r.employee.roleDescription} · {r.employee.sector?.name} · {r.employee.unit?.name} · {SHIFT_LABEL[r.employee.shift]}
                    </p>
                  )}
                  <p className="text-xs text-spot-gray-800 mt-0.5">Resultado: {evaluationResult(r)}</p>
                  {r.employee && (
                    <p className="text-xs text-spot-gray-500 mt-0.5">Situação atual: {statusLabel(r.employee)}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">{titulo(r)}</p>
                  <p className="text-xs text-spot-gray-500">
                    {formatDate(r.evaluationDate)}{quem && ` · por ${quem}`}
                    {r.source === 'FORMS' && ' · Forms'}
                  </p>
                  {cor && (
                    <p className="text-xs text-spot-gray-500 mt-0.5 flex items-center justify-end gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${cor.dotClassName}`} />
                      {COLOR_LABELS[cor.value]}
                    </p>
                  )}
                </div>
              </>
            );
            const classe = 'group flex items-center justify-between gap-4 flex-wrap py-4 border-b border-spot-gray-200 transition-colors hover:bg-spot-white';
            return r.employee
              ? <Link key={r.id} href={`/admin/employees/${r.employee.id}`} className={classe}>{conteudo}</Link>
              : <div key={r.id} className={classe}>{conteudo}</div>;
          })}
        </div>
      </AsyncSection>
    </div>
  );
}
