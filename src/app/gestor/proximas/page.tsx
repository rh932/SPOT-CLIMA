'use client';

import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from '../EmployeeCard';
import { useGestorEmployees, isPending, isUrgent, daysUntilDue, URGENT_DAYS } from '../useGestorEmployees';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';

/**
 * Próximas avaliações, montadas sozinhas a partir dos prazos de cada um (45/90
 * dias da experiência, 2ª avaliação de quem foi efetivado no 1º período e o
 * feedback da cor).
 *
 * Antes esta aba mostrava só quem tinha MAIS de 7 dias de folga: quando a data
 * chegava perto, a pessoa saía daqui — o contrário do que o nome promete.
 * Agora quem vence em até 7 dias (ou já venceu) vem primeiro, em destaque, e o
 * resto segue abaixo. Avaliou, a pessoa sai da lista (ou volta com a data da
 * próxima avaliação) e a avaliação fica no Histórico.
 */
export default function ProximasAvaliacoesPage() {
  const { employees, loading, reloading, error, forbidden, reload } = useGestorEmployees();

  const pendentes = employees
    .filter(isPending)
    .sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0));
  const perto = pendentes.filter(isUrgent);
  const adiante = pendentes.filter((e) => !isUrgent(e));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Próximas avaliações"
        subtitle="Quem está chegando no prazo da próxima avaliação, da mais próxima para a mais distante."
      />

      <RefreshingBar visible={reloading} />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="as próximas avaliações"
        skeleton={<SkeletonCardList rows={3} />}
        empty={pendentes.length === 0}
        emptyState={<EmptyState>Nenhuma avaliação pendente no seu escopo.</EmptyState>}
      >
        <div className="flex flex-col gap-8">
          {perto.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-spot-gray-800">
                Vencem em até {URGENT_DAYS} dias ou já venceram · {perto.length}
              </h2>
              <div className="border-t-[3px] border-spot-yellow">
                <EmployeeList>
                  {perto.map((e) => <EmployeeCard key={e.id} employee={e} />)}
                </EmployeeList>
              </div>
            </section>
          )}
          {adiante.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-spot-gray-500">
                Mais adiante · {adiante.length}
              </h2>
              <div className="border-t border-spot-gray-300">
                <EmployeeList>
                  {adiante.map((e) => <EmployeeCard key={e.id} employee={e} />)}
                </EmployeeList>
              </div>
            </section>
          )}
        </div>
      </AsyncSection>
    </div>
  );
}
