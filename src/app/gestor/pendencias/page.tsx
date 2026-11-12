'use client';

import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from '../EmployeeCard';
import {
  useGestorEmployees, evaluationOverdue, feedbackDue, feedbackLate, daysUntilDue,
  EVALUATION_FILL_DAYS, FEEDBACK_FILL_DAYS,
} from '../useGestorEmployees';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';

/**
 * O que o gestor deixou de fazer no prazo, montado sozinho:
 *
 * - avaliação de experiência que subiu e não foi preenchida em
 *   EVALUATION_FILL_DAYS dias (ver useGestorEmployees);
 * - feedback que venceu — dentro do prazo para fazer ou já atrasado.
 *
 * Avaliou, a pessoa sai daqui na próxima carga da lista.
 */
export default function PendenciasPage() {
  const { employees, canEvaluate, loading, reloading, error, forbidden, reload } = useGestorEmployees();

  const porPrazo = (a: (typeof employees)[number], b: (typeof employees)[number]) =>
    (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0);
  const avaliacoes = employees.filter(evaluationOverdue).sort(porPrazo);
  const feedbacksAtrasados = employees.filter(feedbackLate).sort(porPrazo);
  const feedbacksNoPrazo = employees.filter((e) => feedbackDue(e) && !feedbackLate(e)).sort(porPrazo);
  const total = avaliacoes.length + feedbacksAtrasados.length + feedbacksNoPrazo.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pendências"
        subtitle={canEvaluate
          ? `Avaliações de experiência não preenchidas em ${EVALUATION_FILL_DAYS} dias e feedbacks vencidos (prazo de ${FEEDBACK_FILL_DAYS} dias para fazer).`
          : 'Quem está devendo avaliação ou feedback — para cobrar do gestor do turno.'}
      />

      <RefreshingBar visible={reloading} />

      {/* Erro ANTES de vazio: numa falha de rede a lista vem vazia, e a tela
          antiga anunciava "Tudo em dia por aqui" justamente quando ninguém
          sabia o que estava em dia. */}
      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="as pendências"
        skeleton={<SkeletonCardList rows={3} />}
        empty={total === 0}
        emptyState={<EmptyState>Nenhuma pendência. Tudo em dia por aqui.</EmptyState>}
      >
        <div className="flex flex-col gap-6">
          {avaliacoes.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-danger mb-2">
                Avaliações de experiência ({avaliacoes.length})
              </p>
              <EmployeeList>
                {avaliacoes.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}

          {feedbacksAtrasados.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-danger mb-2">
                Feedbacks atrasados ({feedbacksAtrasados.length})
              </p>
              <EmployeeList>
                {feedbacksAtrasados.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}

          {feedbacksNoPrazo.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-2">
                Feedbacks dentro do prazo ({feedbacksNoPrazo.length})
              </p>
              <EmployeeList>
                {feedbacksNoPrazo.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}
        </div>
      </AsyncSection>
    </div>
  );
}
