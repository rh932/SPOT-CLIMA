'use client';

import { useMemo, useState } from 'react';
import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from '../EmployeeCard';
import {
  useGestorEmployees, isFeedback, feedbackDue, daysUntilDue, openDueDate, FEEDBACK_FILL_DAYS,
} from '../useGestorEmployees';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';
import { FiltrosEquipeBar } from '../FiltrosEquipeBar';
import { ColunaPertoDeVencer, type ItemPertoDeVencer } from '../ColunaPertoDeVencer';
import {
  FILTROS_VAZIOS, filtrarEquipe, filtrosAtivos, pertoDeVencer, type FiltrosEquipe,
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

  const todos = useMemo(
    () => employees.filter(isFeedback).sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0)),
    [employees],
  );
  const lista = useMemo(() => filtrarEquipe(todos, filtros), [todos, filtros]);
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
        subtitle={`Efetivados no ciclo de cores. Quando o feedback vence, você tem ${FEEDBACK_FILL_DAYS} dias para fazer.`}
      />

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
            <FiltrosEquipeBar valor={filtros} onChange={setFiltros} pessoas={todos} />

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
