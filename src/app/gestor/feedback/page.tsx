'use client';

import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from '../EmployeeCard';
import { useGestorEmployees, isFeedback, feedbackDue, daysUntilDue, FEEDBACK_FILL_DAYS } from '../useGestorEmployees';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';

/**
 * Efetivados no ciclo de cores. Quem deu baixa na última avaliação de
 * experiência sai da aba Experiência e aparece aqui, com a data do próximo
 * feedback definida pela cor. No dia em que vence, o feedback também entra em
 * Pendências e o gestor tem FEEDBACK_FILL_DAYS dias para fazer.
 */
export default function FeedbackPage() {
  const { employees, loading, reloading, error, forbidden, reload } = useGestorEmployees();

  const lista = employees
    .filter(isFeedback)
    .sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0));
  const vencidos = lista.filter(feedbackDue);
  const adiante = lista.filter((e) => !feedbackDue(e));

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
        empty={lista.length === 0}
        emptyState={<EmptyState>Ninguém no ciclo de feedback.</EmptyState>}
      >
        <div className="flex flex-col gap-6">
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
      </AsyncSection>
    </div>
  );
}
