'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from './EmployeeCard';
import { useGestorEmployees, isPending, isUrgent } from './useGestorEmployees';
import { statusLabel } from '@/lib/probation';
import { useMyPermissions } from './useMyPermissions';
import { AsyncSection, LiveStatus, RefreshingBar, Skeleton, SkeletonCardList } from '@/components/async';

export default function GestorDashboardPage() {
  const { can, loading: loadingPerms } = useMyPermissions();
  const router = useRouter();
  const { employees, canEvaluate, loading, reloading, error, reload } = useGestorEmployees();

  // Treinador não tem avaliações: a porta de entrada dele é o treinamento.
  const soTreinamento = !loadingPerms && !can('evaluations.view') && can('trainings.view');
  useEffect(() => {
    if (soTreinamento) router.replace('/gestor/treinamento');
  }, [soTreinamento, router]);
  // Esqueleto em vez de "Carregando...": o gestor abre esta tela no celular,
  // em rede ruim, e uma linha cinza numa tela branca lê como app quebrado.
  if (loadingPerms || soTreinamento) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <LiveStatus>Carregando o painel...</LiveStatus>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3 max-w-[18rem]" />
          <Skeleton className="h-3 w-full max-w-[26rem]" />
        </div>
        <SkeletonCardList rows={4} />
      </div>
    );
  }

  const pending = employees.filter(isPending);
  const closed = employees.filter((e) => !isPending(e));
  const urgent = pending.filter(isUrgent);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avaliação de Experiência"
        subtitle={canEvaluate
          ? 'Funcionários em período de experiência nos seus setores, unidades e turno.'
          : 'Acompanhamento das avaliações nos seus setores, unidades e turnos. Quem avalia é o gestor do turno.'}
      />

      <RefreshingBar visible={reloading} texto="Atualizando a lista..." />

      {!loading && !error && urgent.length > 0 && (
        <div className="border-l-[3px] border-spot-yellow bg-spot-white py-3 pl-4 pr-3">
          <p className="text-sm font-semibold">
            {urgent.length === 1 ? '1 avaliação precisa de atenção' : `${urgent.length} avaliações precisam de atenção`}
          </p>
          <p className="text-xs text-spot-gray-500 mt-0.5">
            {canEvaluate
              ? 'Veja em Pendências o que está vencendo ou já venceu.'
              : 'Veja em Pendências quem cobrar.'}
          </p>
        </div>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        retrying={reloading}
        rotulo="a sua equipe"
        skeleton={<SkeletonCardList rows={4} />}
        empty={pending.length === 0 && closed.length === 0}
        emptyState={<EmptyState>Nenhuma avaliação em andamento.</EmptyState>}
      >
        <div className="flex flex-col gap-6">
          <EmployeeList>
            {pending.length === 0 && <EmptyState>Nenhuma avaliação em andamento.</EmptyState>}
            {pending.map((e) => (
              <EmployeeCard key={e.id} employee={e} />
            ))}
          </EmployeeList>

          {closed.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 border-b border-spot-gray-300 pb-2 mb-1">
                Processos concluídos
              </p>
              <EmployeeList>
                {closed.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-4 py-4 border-b border-spot-gray-200 opacity-70">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{e.fullName}</p>
                      <p className="text-xs text-spot-gray-500 mt-0.5">{e.roleDescription}</p>
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-spot-gray-500 shrink-0">
                      {statusLabel(e)}
                    </span>
                  </div>
                ))}
              </EmployeeList>
            </div>
          )}
        </div>
      </AsyncSection>
    </div>
  );
}
