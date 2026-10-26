'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EmptyState, PageHeader } from '../EmployeeCard';
import { useGestorEmployees, SHIFT_LABEL, type GestorEmployee } from '../useGestorEmployees';
import { statusLabel } from '@/lib/probation';
import { COLOR_OPTIONS, COLOR_LABELS, type FeedbackColor } from '@/lib/feedbackCycle';
import { evaluationResult } from '@/lib/employeeTimeline';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';

type EvaluationPeriod = GestorEmployee['evaluations'][number]['period'];

interface HistoryRow {
  key: string;
  employee: GestorEmployee;
  period: EvaluationPeriod;
  cycleNumber: number;
  color: FeedbackColor | null;
  evaluationDate: string;
  evaluator: string | null;
  result: string;
}

const PERIOD_LABEL: Record<EvaluationPeriod, string> = {
  FIRST: '1º ciclo (45 dias)',
  SECOND: '2º ciclo (90 dias)',
  FEEDBACK: 'Feedback periódico',
};

/** Feedbacks se repetem, então a linha mostra de qual deles se trata. */
function periodLabel(row: HistoryRow): string {
  if (row.period !== 'FEEDBACK') return PERIOD_LABEL[row.period];
  return `${row.cycleNumber}º feedback`;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Registro permanente das avaliações do escopo. Cada avaliação é uma linha
 * própria — uma nova nunca substitui a anterior — com colaborador, data,
 * período, avaliador e resultado; o toque abre a ficha na avaliação, com tudo
 * o que foi registrado nela.
 */
export default function HistoricoPage() {
  const { employees, loading, reloading, error, forbidden, reload } = useGestorEmployees();
  const [busca, setBusca] = useState('');

  // Uma linha por avaliação já feita, da mais recente para a mais antiga.
  const todas: HistoryRow[] = employees
    .flatMap((employee) => employee.evaluations.map((ev) => ({
      key: ev.id,
      employee,
      period: ev.period,
      cycleNumber: ev.cycleNumber,
      color: ev.color,
      evaluationDate: ev.evaluationDate,
      evaluator: ev.evaluator?.name ?? ev.evaluatorName ?? null,
      result: evaluationResult(ev),
    })))
    .sort((a, b) => new Date(b.evaluationDate).getTime() - new Date(a.evaluationDate).getTime());
  const q = norm(busca.trim());
  const rows = q ? todas.filter((r) => norm(r.employee.fullName).includes(q)) : todas;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Histórico de avaliações"
        subtitle="Todas as avaliações registradas no seu escopo, da mais recente para a mais antiga."
      />

      {todas.length > 0 && (
        <label className="block">
          <span className="sr-only">Buscar colaborador no histórico</span>
          <input
            type="search"
            className="input"
            placeholder="Buscar colaborador..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
      )}

      <RefreshingBar visible={reloading} />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="o histórico"
        skeleton={<SkeletonCardList rows={4} />}
        empty={rows.length === 0}
        emptyState={<EmptyState>{q ? 'Nenhuma avaliação deste colaborador.' : 'Nenhuma avaliação registrada ainda.'}</EmptyState>}
      >
        <div className="[&>*:last-child]:border-b-0 border-t border-spot-gray-300">
          {rows.map((row) => (
            <Link
              key={row.key}
              href={`/gestor/employees/${row.employee.id}#avaliacao-${row.key}`}
              className="group flex items-center justify-between gap-4 flex-wrap py-4 border-b border-spot-gray-200 transition-colors hover:bg-spot-white"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate group-hover:underline underline-offset-4 decoration-spot-yellow decoration-2">
                  {row.employee.fullName}
                </p>
                <p className="text-xs text-spot-gray-500">
                  {row.employee.sector?.name} · {row.employee.unit?.name} · {SHIFT_LABEL[row.employee.shift]}
                </p>
                <p className="text-xs text-spot-gray-800 mt-0.5">Resultado: {row.result}</p>
                <p className="text-xs text-spot-gray-500 mt-0.5">
                  Situação atual: {statusLabel(row.employee)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium">{periodLabel(row)}</p>
                <p className="text-xs text-spot-gray-500">
                  {new Date(row.evaluationDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                  {row.evaluator && ` · por ${row.evaluator}`}
                </p>
                {row.color && (
                  <p className="text-xs text-spot-gray-500 mt-0.5 flex items-center justify-end gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${COLOR_OPTIONS.find((c) => c.value === row.color)?.dotClassName}`} />
                    {COLOR_LABELS[row.color]}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </AsyncSection>
    </div>
  );
}
