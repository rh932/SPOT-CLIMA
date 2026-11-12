'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from '../EmployeeCard';
import {
  useGestorEmployees, isFeedback, openDueDate, SHIFT_LABEL, type GestorEmployee,
} from '../useGestorEmployees';
import { statusLabel } from '@/lib/probation';
import { COLOR_OPTIONS, COLOR_LABELS, type FeedbackColor } from '@/lib/feedbackCycle';
import { evaluationResult } from '@/lib/employeeTimeline';
import { jaRecebeuFeedback } from '@/lib/feedbackResumo';
import { opcoesDe, normalizaTexto } from '@/lib/gestorEquipe';
import {
  FILTROS_HISTORICO_VAZIOS, TIPOS_REGISTRO, filtrarHistorico, filtrosHistoricoAtivos, ordenarHistorico,
  tipoDoRegistro, type FiltrosHistorico,
} from '@/lib/historicoAvaliacoes';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';
import { BarraFiltros, CampoSelect, ROTULO_FILTRO } from '@/components/ui/BarraFiltros';

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

/**
 * Registro permanente das avaliações de experiência e dos feedbacks do escopo.
 * Cada registro é uma linha própria — um novo nunca substitui o anterior — com
 * colaborador, data, tipo, responsável e resultado; o toque abre a ficha.
 *
 * Os filtros se combinam (unidade, setor, nome, responsável, tipo, período e
 * situação). Buscando uma pessoa só, o histórico vira a linha do tempo dela,
 * do primeiro registro ao mais recente. A situação "Pendente" troca a lista
 * pelos colaboradores que ainda não receberam nenhum feedback. Treinamento tem
 * histórico próprio, em outra aba.
 */
export default function HistoricoPage() {
  const { employees, loading, reloading, error, forbidden, reload } = useGestorEmployees();
  const [f, setF] = useState<FiltrosHistorico>(FILTROS_HISTORICO_VAZIOS);
  const set = (parcial: Partial<FiltrosHistorico>) => setF((atual) => ({ ...atual, ...parcial }));

  const todas: HistoryRow[] = useMemo(() => employees
    .flatMap((employee) => employee.evaluations.map((ev) => ({
      key: ev.id,
      employee,
      period: ev.period,
      cycleNumber: ev.cycleNumber,
      color: ev.color,
      evaluationDate: ev.evaluationDate,
      evaluator: ev.evaluator?.name ?? ev.evaluatorName ?? null,
      result: evaluationResult(ev),
    }))), [employees]);

  const unidades = opcoesDe(employees.map((e) => e.unit?.name));
  const setores = opcoesDe(employees.map((e) => e.sector?.name));
  const responsaveis = opcoesDe(todas.map((r) => r.evaluator));
  const ativos = filtrosHistoricoAtivos(f);

  // Registros feitos, já filtrados; uma pessoa só vira linha do tempo.
  const { rows, cronologico } = useMemo(
    () => ordenarHistorico(filtrarHistorico(todas, f)),
    [todas, f],
  );

  // Quem ainda não recebeu nenhum feedback (participantes do ciclo).
  const pendentes = useMemo(() => {
    const q = normalizaTexto(f.busca.trim());
    return employees
      .filter((e) => isFeedback(e) && !jaRecebeuFeedback(e))
      .filter((e) => (!q || normalizaTexto(e.fullName).includes(q))
        && (!f.unidade || e.unit?.name === f.unidade)
        && (!f.setor || e.sector?.name === f.setor)
        && (!f.responsavel || (e.responsaveis ?? []).includes(f.responsavel)))
      .sort((a, b) => (openDueDate(a)?.getTime() ?? 0) - (openDueDate(b)?.getTime() ?? 0));
  }, [employees, f]);

  const verPendentes = f.status === 'PENDENTE';
  const encontrados = verPendentes ? pendentes.length : rows.length;
  const unicaPessoa = cronologico && rows.length > 0 ? rows[0].employee : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Histórico de avaliações e feedbacks"
        subtitle="Todos os registros do seu escopo. Filtre por unidade, setor, responsável, tipo, período e situação — ou busque um colaborador para ver a linha do tempo dele."
      />

      {employees.length > 0 && (
        <BarraFiltros
          busca={f.busca}
          onBusca={(busca) => set({ busca })}
          placeholder="Buscar colaborador..."
          rotuloBusca="Buscar colaborador no histórico"
          ativos={ativos - (f.busca.trim() !== '' ? 1 : 0)}
          onLimpar={() => setF(FILTROS_HISTORICO_VAZIOS)}
          totalResultados={encontrados}
          resumo={verPendentes
            ? `${encontrados} ${encontrados === 1 ? 'colaborador ainda não recebeu' : 'colaboradores ainda não receberam'} feedback`
            : `${encontrados} ${encontrados === 1 ? 'registro encontrado' : 'registros encontrados'}${ativos > 0 ? ` de ${todas.length}` : ''}`}
        >
          {unidades.length > 1 && (
            <CampoSelect rotulo="Unidade" valor={f.unidade} onChange={(unidade) => set({ unidade })}>
              <option value="">Todas</option>
              {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
            </CampoSelect>
          )}
          {setores.length > 1 && (
            <CampoSelect rotulo="Setor" valor={f.setor} onChange={(setor) => set({ setor })}>
              <option value="">Todos</option>
              {setores.map((s) => <option key={s} value={s}>{s}</option>)}
            </CampoSelect>
          )}
          <CampoSelect rotulo="Situação" valor={f.status} onChange={(status) => set({ status: status as FiltrosHistorico['status'] })}>
            <option value="">Todas</option>
            <option value="REALIZADO">Realizado</option>
            <option value="PENDENTE">Pendente (sem feedback)</option>
          </CampoSelect>
          <CampoSelect rotulo="Tipo de registro" valor={f.tipo} onChange={(tipo) => set({ tipo: tipo as FiltrosHistorico['tipo'] })} disabled={verPendentes}>
            <option value="">Todos</option>
            {TIPOS_REGISTRO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </CampoSelect>
          {(responsaveis.length > 0 || f.responsavel) && (
            <CampoSelect rotulo="Responsável" valor={f.responsavel} onChange={(responsavel) => set({ responsavel })}>
              <option value="">Todos</option>
              {responsaveis.map((n) => <option key={n} value={n}>{n}</option>)}
            </CampoSelect>
          )}
          <fieldset className="min-w-0" disabled={verPendentes}>
            <legend className={`${ROTULO_FILTRO} mb-1`}>Realizado entre</legend>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="sr-only">Realizado a partir de</span>
                <input type="date" className="input w-full" value={f.de} max={f.ate || undefined} onChange={(e) => set({ de: e.target.value })} />
              </label>
              <label>
                <span className="sr-only">Realizado até</span>
                <input type="date" className="input w-full" value={f.ate} min={f.de || undefined} onChange={(e) => set({ ate: e.target.value })} />
              </label>
            </div>
          </fieldset>
        </BarraFiltros>
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
        empty={encontrados === 0}
        emptyState={
          <EmptyState>
            {verPendentes
              ? 'Todos os colaboradores desta busca já receberam feedback.'
              : ativos > 0 ? 'Nenhum registro para esta busca.' : 'Nenhuma avaliação registrada ainda.'}
          </EmptyState>
        }
      >
        {verPendentes ? (
          <EmployeeList>
            {pendentes.map((e) => <EmployeeCard key={e.id} employee={e} />)}
          </EmployeeList>
        ) : (
          <div className="flex flex-col gap-3">
            {unicaPessoa && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-spot-gray-900 pb-2">
                <p className="font-semibold">
                  Linha do tempo de {unicaPessoa.fullName}
                  <span className="text-xs text-spot-gray-500 font-normal"> · do primeiro registro ao mais recente</span>
                </p>
                <Link href={`/gestor/employees/${unicaPessoa.id}`} className="btn-ghost text-xs py-1.5 px-3 min-h-10">Abrir a ficha</Link>
              </div>
            )}
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
                      {tipoDoRegistro(row.period) === 'FEEDBACK' ? 'Feedback' : 'Avaliação de experiência'}
                    </p>
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
          </div>
        )}
      </AsyncSection>
    </div>
  );
}
