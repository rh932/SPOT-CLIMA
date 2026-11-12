'use client';

import Link from 'next/link';
import { statusLabel } from '@/lib/probation';
import { COLOR_OPTIONS, COLOR_LABELS } from '@/lib/feedbackCycle';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { SHIFT_LABEL, prazoBadge, isFeedbackCycle, awaitsSecond, type GestorEmployee } from './useGestorEmployees';

/**
 * Linha de funcionário usada por todas as abas do painel do gestor.
 *
 * Sempre leva para a FICHA do colaborador, nunca direto para o formulário: a
 * ficha é onde estão a situação, a cor e o histórico, e é de lá que sai o
 * botão de avaliar. Antes o card ia direto para a avaliação quando quem
 * olhava podia avaliar — e, quando não podia (Gestor Líder), não ia a lugar
 * nenhum, o que fazia a lista parecer quebrada.
 *
 * Na linguagem "Placa de serviço" cada pessoa é uma FICHA: papel claro com
 * filete de tinta e uma aba colorida à esquerda que diz o prazo de longe —
 * tomate para atrasado, amarelo para o que vence em até 7 dias, cinza para o
 * resto. A etiqueta em mono repete o prazo por escrito: cor sozinha não
 * carrega significado. A área de toque é a ficha inteira, bem acima de 44px.
 */
/** Tom da aba a partir do selo de prazo (ver dueBadge em src/lib/probation). */
function tomDoPrazo(className: string | undefined): 'atrasado' | 'perto' | 'longe' {
  if (!className) return 'longe';
  if (className.includes('C93A3A')) return 'atrasado';
  if (className.includes('gray-800')) return 'perto';
  return 'longe';
}

const ABA = { atrasado: 'bg-spot-danger', perto: 'bg-spot-yellow', longe: 'bg-spot-gray-300' } as const;
const ETIQUETA = {
  atrasado: 'bg-spot-dangerFill text-white',
  perto: 'bg-spot-yellow text-spot-onYellow',
  longe: 'border border-spot-gray-900 text-spot-gray-900',
} as const;

export function EmployeeCard({
  employee, muted = false,
}: { employee: GestorEmployee; muted?: boolean; index?: number }) {
  const badge = prazoBadge(employee);
  const tom = tomDoPrazo(badge?.className);
  const colorOption = employee.currentColor ? COLOR_OPTIONS.find((c) => c.value === employee.currentColor) : null;

  return (
    <Link
      href={`/gestor/employees/${employee.id}`}
      className={`group relative flex items-start justify-between gap-3 overflow-hidden rounded-xl2 border-[1.5px] bg-spot-white py-3.5 pl-5 pr-3.5 transition-[transform,box-shadow] duration-100 hover:-translate-y-px hover:shadow-[0_3px_0_rgb(var(--spot-gray-900))] ${
        muted ? 'border-spot-gray-300' : 'border-spot-gray-900'
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[7px] ${ABA[tom]}`} />
      <div className="min-w-0">
        <p className="text-base font-semibold truncate">
          {employee.fullName}
        </p>
        <p className="text-xs text-spot-gray-600 mt-0.5">
          {employee.roleDescription} · {employee.sector?.name} · {employee.unit?.name} · {SHIFT_LABEL[employee.shift]}
        </p>
        <p className="text-xs text-spot-gray-600 mt-1 flex items-center gap-1.5">
          {colorOption && (
            <span
              className={`h-2 w-2 rounded-[1px] ${colorOption.dotClassName}`}
              title={`Classificação ${COLOR_LABELS[colorOption.value]}`}
            />
          )}
          {awaitsSecond(employee)
            ? 'Efetivado no 1º período · falta a 2ª avaliação'
            : isFeedbackCycle(employee) ? 'Efetivado · ciclo de feedback' : statusLabel(employee)}
        </p>
        {employee.secondOpinion && (
          <p className="text-xs font-semibold text-spot-gray-800 mt-1">
            Você também pode avaliar o {employee.secondOpinion.period === 'FIRST' ? '1º' : '2º'} período
            · até {new Date(employee.secondOpinion.until).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
          </p>
        )}
      </div>
      {badge && (
        <span className={`badge shrink-0 mt-0.5 ${ETIQUETA[tom]}`}>
          {badge.label}
        </span>
      )}
    </Link>
  );
}

/** Lista de funcionários: fichas empilhadas, com respiro entre elas. */
export function EmployeeList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border-[1.5px] border-dashed border-spot-gray-300 text-center py-12 px-4 voz text-lg">{children}</div>
  );
}

/** Mantido para não quebrar as telas que já importavam daqui. */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <CabecalhoPagina titulo={title} subtitulo={subtitle} />;
}
