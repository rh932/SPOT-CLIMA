'use client';

import { useMemo, useState } from 'react';
import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from '../EmployeeCard';
import {
  useGestorEmployees, isFeedback, feedbackDue, feedbackLate, daysUntilDue, openDueDate, FEEDBACK_FILL_DAYS,
  type GestorEmployee,
} from '../useGestorEmployees';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';
import { FiltrosEquipeBar } from '../FiltrosEquipeBar';
import { StatCard } from '@/components/StatCard';
import { resumoFeedback, jaRecebeuFeedback } from '@/lib/feedbackResumo';
import { RoteiroFeedback } from './RoteiroFeedback';
import { ColunaPertoDeVencer, type ItemPertoDeVencer } from '../ColunaPertoDeVencer';
import {
  FILTROS_VAZIOS, filtrarEquipe, ordenarEquipe, filtrosAtivos, pertoDeVencer, type ExtrasFiltro, type FiltrosEquipe,
} from '@/lib/gestorEquipe';

/**
 * Efetivados no ciclo de cores. Quem deu baixa na última avaliação de
 * experiência sai da aba Experiência e aparece aqui, com a data do próximo
 * feedback definida pela cor. No dia em que vence, o feedback também entra em
 * Pendências e o gestor tem FEEDBACK_FILL_DAYS dias para fazer.
 *
 * A coluna da direita traz só quem vence em breve; a lista completa segue
 * abaixo, filtrável, para quando a equipe crescer.
 */
export default function FeedbackPage() {
  const { employees, loading, reloading, error, forbidden, reload } = useGestorEmployees();
  const [filtros, setFiltros] = useState<FiltrosEquipe>(FILTROS_VAZIOS);
  const [recorte, setRecorte] = useState<'TODOS' | 'VENCIDOS' | 'NUNCA'>('TODOS');

  const todos = useMemo(
    () => employees.filter(isFeedback).sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0)),
    [employees],
  );
  const resumo = useMemo(() => resumoFeedback(todos), [todos]);
  const extras = useMemo<ExtrasFiltro<GestorEmployee>>(() => ({
    statusDe: (e) => (feedbackLate(e) ? 'ATRASADO' : feedbackDue(e) ? 'PENDENTE' : 'EM_DIA'),
    responsaveisDe: (e) => e.responsaveis ?? [],
  }), []);
  const lista = useMemo(() => {
    const base = ordenarEquipe(filtrarEquipe(todos, filtros, extras), filtros.ordem, extras);
    if (recorte === 'VENCIDOS') return base.filter(feedbackDue);
    if (recorte === 'NUNCA') return base.filter((e) => !jaRecebeuFeedback(e));
    return base;
  }, [todos, filtros, recorte, extras]);
  const vencidos = lista.filter(feedbackDue);
  const adiante = lista.filter((e) => !feedbackDue(e));

  const pertoVencer: ItemPertoDeVencer[] = useMemo(
    () => lista
      .filter((e) => pertoDeVencer(openDueDate(e)))
      .map((e) => ({
        id: e.id,
        nome: e.fullName,
        detalhe: `${e.sector?.name ?? ''} · ${e.unit?.name ?? ''}`,
        prazo: openDueDate(e)!,
        href: `/gestor/employees/${e.id}`,
      })),
    [lista],
  );

  const semResultado = todos.length > 0 && lista.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Feedback"
        subtitle={`Todo colaborador ativo ou efetivado no ciclo de cores participa. Quando o feedback vence, você tem ${FEEDBACK_FILL_DAYS} dias para fazer.`}
      />

      <RoteiroFeedback />

      <RefreshingBar visible={reloading} />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="os feedbacks"
        skeleton={<SkeletonCardList rows={4} />}
        empty={todos.length === 0}
        emptyState={<EmptyState>Ninguém no ciclo de feedback.</EmptyState>}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <aside className="order-first lg:order-last">
            <ColunaPertoDeVencer
              id="feedback-perto-vencer"
              itens={pertoVencer}
              vazio={filtrosAtivos(filtros) > 0 ? 'Nenhum feedback perto de vencer nesta busca.' : 'Ninguém perto de vencer.'}
            />
          </aside>

          <div className="min-w-0 flex flex-col gap-6">
            {/* Compacto no celular: números menores e sem a frase de apoio, para a lista aparecer sem rolar. */}
            <div className="grid grid-cols-4 gap-x-3 [&_.stat-valor]:!text-3xl sm:[&_.stat-valor]:!text-5xl [&_.stat-valor]:!mt-1.5 [&_.stat-rotulo]:!text-[9px] sm:[&_.stat-rotulo]:!text-[10px] [&_.stat-apoio]:hidden sm:[&_.stat-apoio]:block">
              <StatCard label="No ciclo" value={String(resumo.total)} sub="colaboradores" />
              <StatCard label="Vencidos" value={String(resumo.vencidos)} sub="feedback para fazer" destaque />
              <StatCard label="Sem feedback" value={String(resumo.nuncaReceberam)} sub="sem nenhum feedback" />
              <StatCard label="Neste mês" value={String(resumo.noMes)} sub="receberam feedback" />
            </div>

            <FiltrosEquipeBar
              valor={filtros}
              onChange={setFiltros}
              pessoas={todos}
              statusOpcoes={[
                { valor: 'PENDENTE', rotulo: 'Pendente (dentro do prazo)' },
                { valor: 'ATRASADO', rotulo: 'Atrasado' },
                { valor: 'EM_DIA', rotulo: 'Em dia' },
              ]}
              responsaveis={todos.flatMap((e) => e.responsaveis ?? [])}
              rotuloResponsavel="Gerente responsável"
              comPeriodo
              comOrdem
              encontrados={lista.length}
              totalGeral={todos.length}
            />

            <div className="flex flex-wrap gap-2" role="group" aria-label="Recorte da lista">
              {([['TODOS', 'Todos'], ['VENCIDOS', 'Só vencidos'], ['NUNCA', 'Nunca receberam']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={recorte === k}
                  onClick={() => setRecorte(k)}
                  className={`min-h-11 px-3 rounded-btn border text-sm ${recorte === k ? 'border-spot-gray-900 bg-spot-cream font-semibold' : 'border-spot-gray-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {semResultado && <EmptyState>Nenhum feedback para esta busca.</EmptyState>}

            {vencidos.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-800 border-b border-spot-gray-300 pb-2 mb-1">
                  Feedback para fazer · {vencidos.length}
                </p>
                <EmployeeList>
                  {vencidos.map((e) => <EmployeeCard key={e.id} employee={e} />)}
                </EmployeeList>
              </div>
            )}

            {adiante.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 border-b border-spot-gray-300 pb-2 mb-1">
                  Próximos feedbacks · {adiante.length}
                </p>
                <EmployeeList>
                  {adiante.map((e) => <EmployeeCard key={e.id} employee={e} muted />)}
                </EmployeeList>
              </div>
            )}
          </div>
        </div>
      </AsyncSection>
    </div>
  );
}
