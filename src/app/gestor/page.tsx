'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from './EmployeeCard';
import {
  useGestorEmployees, isExperience, evaluationOpen, evaluationOverdue, daysUntilDue,
  EVALUATION_OPENS_DAYS, EVALUATION_FILL_DAYS,
} from './useGestorEmployees';
import { useMyPermissions } from './useMyPermissions';
import { AsyncSection, LiveStatus, RefreshingBar, Skeleton, SkeletonCardList } from '@/components/async';

export default function GestorDashboardPage() {
  const { can, loading: loadingPerms } = useMyPermissions();
  const router = useRouter();
  const { employees, canEvaluate, loading, reloading, error, forbidden, reload } = useGestorEmployees();

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

  // Só quem ainda está em contrato de experiência. Deu baixa na última
  // avaliação, a pessoa sai daqui sozinha e passa para a aba Feedback.
  const emExperiencia = employees
    .filter(isExperience)
    .sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0));
  const abertas = emExperiencia.filter(evaluationOpen);
  const aguardando = emExperiencia.filter((e) => !evaluationOpen(e));
  const urgent = emExperiencia.filter(evaluationOverdue);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avaliação de Experiência"
        subtitle={canEvaluate
          ? `Funcionários em contrato de experiência nos seus setores, unidades e turno. A avaliação sobe ${EVALUATION_OPENS_DAYS} dias antes do fim do contrato e você tem ${EVALUATION_FILL_DAYS} dias para preencher.`
          : 'Acompanhamento das avaliações nos seus setores, unidades e turnos. Quem avalia é o gestor do turno.'}
      />

      <RefreshingBar visible={reloading} texto="Atualizando a lista..." />

      {!loading && !error && urgent.length > 0 && (
        <div className="flex items-center gap-4 rounded-xl2 bg-spot-yellow text-spot-onYellow p-4">
          <p className="text-6xl font-extrabold leading-[0.85] tracking-[-0.05em] tabular shrink-0">{urgent.length}</p>
          <div className="min-w-0">
          <p className="font-display italic text-xl leading-tight">
            {urgent.length === 1 ? 'avaliação passou do prazo de preenchimento' : 'avaliações passaram do prazo de preenchimento'}
          </p>
          <p className="text-xs mt-1">
            {canEvaluate
              ? 'Elas já estão em Pendências.'
              : 'Veja em Pendências quem cobrar.'}
          </p>
          </div>
        </div>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="a sua equipe"
        skeleton={<SkeletonCardList rows={4} />}
        empty={emExperiencia.length === 0}
        emptyState={<EmptyState>Ninguém em contrato de experiência.</EmptyState>}
      >
        <div className="flex flex-col gap-6">
          {abertas.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-900 border-b-[1.5px] border-spot-gray-900 pb-2 mb-3">
                Avaliação disponível · {abertas.length}
              </p>
              <EmployeeList>
                {abertas.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}

          {aguardando.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-600 border-b border-spot-gray-400 pb-2 mb-3">
                Em experiência · {aguardando.length}
              </p>
              <EmployeeList>
                {aguardando.map((e) => <EmployeeCard key={e.id} employee={e} muted />)}
              </EmployeeList>
            </div>
          )}
        </div>
      </AsyncSection>
    </div>
  );
}
