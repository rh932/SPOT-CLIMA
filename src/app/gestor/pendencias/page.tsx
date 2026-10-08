'use client';

import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from '../EmployeeCard';
import { useGestorEmployees, isUrgent, daysUntilDue, URGENT_DAYS } from '../useGestorEmployees';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';

export default function PendenciasPage() {
  const { employees, canEvaluate, loading, reloading, error, reload } = useGestorEmployees();

  const urgent = employees.filter(isUrgent);
  const atrasadas = urgent.filter((e) => (daysUntilDue(e) ?? 0) < 0);
  const vencendo = urgent.filter((e) => (daysUntilDue(e) ?? 0) >= 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pendências"
        subtitle={canEvaluate
          ? `Avaliações já vencidas ou que vencem nos próximos ${URGENT_DAYS} dias.`
          : `Quem está devendo avaliação — vencidas ou vencendo nos próximos ${URGENT_DAYS} dias.`}
      />

      <RefreshingBar visible={reloading} />

      {/* Erro ANTES de vazio: numa falha de rede a lista vem vazia, e a tela
          antiga anunciava "Tudo em dia por aqui" justamente quando ninguém
          sabia o que estava em dia. */}
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        retrying={reloading}
        rotulo="as pendências"
        skeleton={<SkeletonCardList rows={3} />}
        empty={urgent.length === 0}
        emptyState={<EmptyState>Nenhuma pendência. Tudo em dia por aqui.</EmptyState>}
      >
        <div className="flex flex-col gap-6">
          {atrasadas.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-danger mb-2">
                Atrasadas ({atrasadas.length})
              </p>
              <EmployeeList>
                {atrasadas.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}

          {vencendo.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-2">
                Vencendo em breve ({vencendo.length})
              </p>
              <EmployeeList>
                {vencendo.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}
        </div>
      </AsyncSection>
    </div>
  );
}
