'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeeCard, EmployeeList, EmptyState, PageHeader } from './EmployeeCard';
import {
  useGestorEmployees, isExperience, evaluationOpen, evaluationOverdue, daysUntilDue,
  EVALUATION_OPENS_DAYS, EVALUATION_FILL_DAYS,
} from './useGestorEmployees';
import { useMyPermissions } from './useMyPermissions';
import { AsyncSection, LiveStatus, RefreshingBar, Skeleton, SkeletonCardList } from '@/components/async';
import { FiltrosEquipeBar } from './FiltrosEquipeBar';
import {
  FILTROS_VAZIOS, filtrarEquipe, ordenarEquipe, type ExtrasFiltro, type FiltrosEquipe,
} from '@/lib/gestorEquipe';
import type { GestorEmployee } from './useGestorEmployees';

export default function GestorDashboardPage() {
  const { can, loading: loadingPerms } = useMyPermissions();
  const router = useRouter();
  const { employees, canEvaluate, loading, reloading, error, forbidden, reload } = useGestorEmployees();
  const [filtros, setFiltros] = useState<FiltrosEquipe>(FILTROS_VAZIOS);

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
  const urgent = emExperiencia.filter(evaluationOverdue);

  // Filtros combinados: situação da avaliação, etapa (1ª ou 2ª), gerente
  // responsável e período de admissão — tudo sobre a lista que veio do banco.
  const extras: ExtrasFiltro<GestorEmployee> = {
    statusDe: (e) => (evaluationOverdue(e) ? 'ATRASADA' : evaluationOpen(e) ? 'PENDENTE' : 'AGUARDANDO'),
    etapaDe: (e) => (e.status === 'AWAITING_PERIOD_1' ? 'PRIMEIRA' : 'SEGUNDA'),
    responsaveisDe: (e) => e.responsaveis ?? [],
  };
  const filtrados = ordenarEquipe(filtrarEquipe(emExperiencia, filtros, extras), filtros.ordem, extras);
  const abertas = filtrados.filter(evaluationOpen);
  const aguardando = filtrados.filter((e) => !evaluationOpen(e));
  const semResultado = emExperiencia.length > 0 && filtrados.length === 0;
  // Com ordenação escolhida, a lista vira uma só: separar em blocos desfaria a ordem.
  const listaUnica = filtros.ordem !== '';

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
          <FiltrosEquipeBar
            valor={filtros}
            onChange={setFiltros}
            pessoas={emExperiencia}
            statusOpcoes={[
              { valor: 'PENDENTE', rotulo: 'Pendente (disponível)' },
              { valor: 'ATRASADA', rotulo: 'Atrasada' },
              { valor: 'AGUARDANDO', rotulo: 'Aguardando prazo' },
            ]}
            etapaOpcoes={[
              { valor: 'PRIMEIRA', rotulo: '1ª avaliação (45 dias)' },
              { valor: 'SEGUNDA', rotulo: '2ª avaliação (90 dias)' },
            ]}
            rotuloEtapa="Etapa da experiência"
            responsaveis={emExperiencia.flatMap((e) => e.responsaveis ?? [])}
            rotuloResponsavel="Gerente responsável"
            comPeriodo
            comOrdem
            encontrados={filtrados.length}
            totalGeral={emExperiencia.length}
          />

          {semResultado && <EmptyState>Nenhuma avaliação para esta busca.</EmptyState>}

          {listaUnica && filtrados.length > 0 && (
            <EmployeeList>
              {filtrados.map((e) => <EmployeeCard key={e.id} employee={e} muted={!evaluationOpen(e)} />)}
            </EmployeeList>
          )}

          {!listaUnica && abertas.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-900 border-b-[1.5px] border-spot-gray-900 pb-2 mb-3">
                Avaliação disponível · {abertas.length}
              </p>
              <EmployeeList>
                {abertas.map((e) => <EmployeeCard key={e.id} employee={e} />)}
              </EmployeeList>
            </div>
          )}

          {!listaUnica && aguardando.length > 0 && (
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
