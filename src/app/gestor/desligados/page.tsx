'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { EmployeeList, EmptyState } from '../EmployeeCard';
import { useGestorEmployees, SHIFT_LABEL, type GestorEmployee } from '../useGestorEmployees';
import { AsyncSection, RefreshingBar, SkeletonCardList } from '@/components/async';
import { FiltrosEquipeBar } from '../FiltrosEquipeBar';
import { FILTROS_VAZIOS, filtrarEquipe, type ExtrasFiltro, type FiltrosEquipe } from '@/lib/gestorEquipe';
import { TERMINATION_LABELS, type TerminationReason } from '@/lib/termination';

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/** Sem motivo registrado: desligado pela avaliação ("Demitir") antes de o registro de saída existir. */
const SEM_MOTIVO = 'SEM_MOTIVO';
const motivoDe = (e: GestorEmployee) => e.saida?.reason ?? SEM_MOTIVO;
const rotuloMotivo = (m: string) =>
  m === SEM_MOTIVO ? 'Desligado na avaliação' : TERMINATION_LABELS[m as TerminationReason] ?? 'Outro motivo';

/** Mais recente primeiro; sem data de saída vai para o fim. */
const porSaida = (a: GestorEmployee, b: GestorEmployee) => {
  const da = a.saida?.date ? new Date(a.saida.date).getTime() : 0;
  const db = b.saida?.date ? new Date(b.saida.date).getTime() : 0;
  return db - da || a.fullName.localeCompare(b.fullName, 'pt-BR');
};

/**
 * Quem já saiu do Spot. Fica fora das abas do dia a dia (Experiência,
 * Feedback, Pendências, Próximas, Treinamento) e não gera lembrete, mas não é
 * apagado: a ficha e o histórico continuam aqui. Para mandar alguém para cá,
 * o gestor abre a ficha e usa "Registrar desligamento"; para trazer de volta,
 * "Desfazer desligamento" na mesma ficha.
 */
export default function DesligadosPage() {
  const { desligados, loading, reloading, error, forbidden, reload } = useGestorEmployees();
  const [filtros, setFiltros] = useState<FiltrosEquipe>(FILTROS_VAZIOS);

  const todos = useMemo(() => [...desligados].sort(porSaida), [desligados]);
  const extras = useMemo<ExtrasFiltro<GestorEmployee>>(() => ({ statusDe: motivoDe }), []);
  const lista = useMemo(() => filtrarEquipe(todos, filtros, extras), [todos, filtros, extras]);
  const motivos = useMemo(
    () => [...new Set(todos.map(motivoDe))].map((m) => ({ valor: m, rotulo: rotuloMotivo(m) })),
    [todos],
  );

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Desligados"
        subtitulo="Quem já saiu do Spot. Não aparece nas listas da equipe nem gera lembrete, e o histórico continua guardado. Para registrar uma saída, abra a ficha do colaborador e use “Registrar desligamento”."
      />

      <RefreshingBar visible={reloading} />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="os desligados"
        skeleton={<SkeletonCardList rows={4} />}
        empty={todos.length === 0}
        emptyState={<EmptyState>Ninguém desligado na sua equipe.</EmptyState>}
      >
        <div className="flex flex-col gap-4">
          <FiltrosEquipeBar
            valor={filtros}
            onChange={setFiltros}
            pessoas={todos}
            statusOpcoes={motivos}
            rotuloStatus="Motivo da saída"
            comPeriodo
            encontrados={lista.length}
            totalGeral={todos.length}
          />

          {lista.length === 0 ? (
            <EmptyState>Ninguém desligado nesta busca.</EmptyState>
          ) : (
            <EmployeeList>
              {lista.map((e) => (
                <Link
                  key={e.id}
                  href={`/gestor/employees/${e.id}`}
                  className="group relative flex items-start justify-between gap-3 overflow-hidden rounded-xl2 border-[1.5px] border-spot-gray-300 bg-spot-white py-3.5 pl-5 pr-3.5 transition-[transform,box-shadow] duration-100 hover:-translate-y-px hover:shadow-[0_3px_0_rgb(var(--spot-gray-900))]"
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-[7px] bg-spot-gray-300" />
                  <div className="min-w-0">
                    <p className="text-base font-semibold truncate">{e.fullName}</p>
                    <p className="text-xs text-spot-gray-600 mt-0.5">
                      {e.roleDescription} · {e.sector?.name} · {e.unit?.name} · {SHIFT_LABEL[e.shift]}
                    </p>
                    <p className="text-xs text-spot-gray-600 mt-1">
                      {rotuloMotivo(motivoDe(e))} · admitido em {formatDate(e.admissionDate)}
                    </p>
                  </div>
                  <span className="badge shrink-0 mt-0.5 border border-spot-gray-300 text-spot-gray-600">
                    {e.saida?.date ? `Saiu em ${formatDate(e.saida.date)}` : 'Desligado'}
                  </span>
                </Link>
              ))}
            </EmployeeList>
          )}
        </div>
      </AsyncSection>
    </div>
  );
}
