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
 * Deixou de ser um card branco solto para virar uma LINHA de lista. Doze cards
 * empilhados com sombra e espaço entre eles viram doze caixas iguais que o
 * olho tem de abrir uma a uma; separados por filete, viram uma lista que se
 * varre de cima a baixo — e cabe muito mais coisa na tela do telefone, que é
 * onde o gestor usa isto. A área de toque continua a linha inteira, bem acima
 * dos 44px.
 */
export function EmployeeCard({
  employee, muted = false,
}: { employee: GestorEmployee; muted?: boolean; index?: number }) {
  const badge = prazoBadge(employee);
  const colorOption = employee.currentColor ? COLOR_OPTIONS.find((c) => c.value === employee.currentColor) : null;

  return (
    <Link
      href={`/gestor/employees/${employee.id}`}
      className={`group flex items-center justify-between gap-4 py-4 border-b border-spot-gray-200 transition-colors hover:bg-spot-white${
        muted ? ' opacity-70' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold truncate group-hover:underline underline-offset-4 decoration-spot-yellow decoration-2">
          {employee.fullName}
        </p>
        <p className="text-xs text-spot-gray-500 mt-0.5">
          {employee.roleDescription} · {employee.sector?.name} · {employee.unit?.name} · {SHIFT_LABEL[employee.shift]}
        </p>
        <p className="text-xs text-spot-gray-500 mt-1 flex items-center gap-1.5">
          {colorOption && (
            <span
              className={`h-2 w-2 rounded-full ${colorOption.dotClassName}`}
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
        <span className={`font-mono text-[11px] uppercase tracking-[0.1em] shrink-0 text-right ${badge.className}`}>
          {badge.label}
        </span>
      )}
    </Link>
  );
}

/** Lista de funcionários: filete entre as linhas, sem o último para não sobrar traço solto. */
export function EmployeeList({ children }: { children: React.ReactNode }) {
  return <div className="[&>*:last-child]:border-b-0">{children}</div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-y border-spot-gray-200 text-center py-12 text-spot-gray-500 text-sm">{children}</div>
  );
}

/** Mantido para não quebrar as telas que já importavam daqui. */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <CabecalhoPagina titulo={title} subtitulo={subtitle} />;
}
