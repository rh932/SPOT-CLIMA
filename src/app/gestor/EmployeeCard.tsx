'use client';

import Link from 'next/link';
import { statusLabel } from '@/lib/probation';
import { COLOR_OPTIONS, COLOR_LABELS } from '@/lib/feedbackCycle';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { ListaViva } from '@/components/ui/ListaViva';
import { Ic } from '@/components/sp/Ic';
import { FotoColaborador } from '@/components/ui/FotoColaborador';
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
 * No padrão Spot Integra é a linha `.qrow`: no celular um cartão (nome, dados
 * e etiquetas); no computador uma linha de tabela com colunas. O prazo sai
 * sempre por escrito na etiqueta: cor sozinha nunca carrega significado.
 */
type Tom = 'atrasado' | 'perto' | 'longe';

/** Tom do prazo a partir do selo (ver dueBadge em src/lib/probation). */
export function tomDoPrazo(className: string | undefined): Tom {
  if (!className) return 'longe';
  if (className.includes('C93A3A')) return 'atrasado';
  if (className.includes('gray-800')) return 'perto';
  return 'longe';
}

const ETIQUETA: Record<Tom, string> = { atrasado: 't-late', perto: 't-week', longe: 't-soft' };
const AVATAR: Record<Tom, string> = { atrasado: 'late', perto: 'soon', longe: '' };

export const iniciaisDe = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Etapa em linguagem de gente: o que esta pessoa está fazendo agora. */
export function etapaLabel(e: GestorEmployee): string {
  if (awaitsSecond(e)) return '2ª avaliação (90 dias)';
  if (isFeedbackCycle(e)) return 'Ciclo de feedback';
  if (e.status === 'AWAITING_PERIOD_1') return '1ª avaliação (45 dias)';
  if (e.status === 'AWAITING_PERIOD_2') return '2ª avaliação (90 dias)';
  return statusLabel(e);
}

/** Cabeça da tabela no computador; combina com as colunas de `.qrow`. */
export function EmployeeListHead() {
  return (
    <div className="qhead desk kick" aria-hidden="true">
      <span>Colaborador</span>
      <span>Setor · unidade · turno</span>
      <span>Etapa</span>
      <span>Prazo</span>
      <span>Situação</span>
      <span />
    </div>
  );
}

export function EmployeeCard({
  employee, muted = false, index = 0,
}: { employee: GestorEmployee; muted?: boolean; index?: number }) {
  const badge = prazoBadge(employee);
  const tom = tomDoPrazo(badge?.className);
  const colorOption = employee.currentColor ? COLOR_OPTIONS.find((c) => c.value === employee.currentColor) : null;
  const onde = [employee.sector?.name, employee.unit?.name, SHIFT_LABEL[employee.shift]].filter(Boolean).join(' · ');
  const situacao = awaitsSecond(employee)
    ? 'Efetivado no 1º período · falta a 2ª avaliação'
    : isFeedbackCycle(employee) ? 'Efetivado · ciclo de feedback' : statusLabel(employee);
  const segunda = employee.secondOpinion
    ? `Você também pode avaliar o ${employee.secondOpinion.period === 'FIRST' ? '1º' : '2º'} período · até ${new Date(employee.secondOpinion.until).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
    : null;

  return (
    <Link
      href={`/gestor/employees/${employee.id}`}
      className={`qrow mk-opt ${muted ? 'is-muted' : ''}`}
      style={{ ['--n' as string]: Math.min(index, 8) }}
    >
      <span className="who">
        <span className={`av ${muted ? '' : AVATAR[tom]}`} aria-hidden="true">{iniciaisDe(employee.fullName)}<FotoColaborador employeeId={employee.id} portal="gestor" /></span>
        <span className="info">
          <b>{employee.fullName}</b>
          <small>{employee.roleDescription}<span className="mob"> · {onde}</span></small>
          <span className="tags">
            {badge && <span className={`tag ${ETIQUETA[tom]}`}>{badge.label}</span>}
            <span className="tag t-soft">{etapaLabel(employee)}</span>
          </span>
          {colorOption && (
            <small className="cor-linha">
              <span aria-hidden className={`cor-ponto ${colorOption.dotClassName}`} />
              {/* Por extenso: o tooltip de antes não aparece no toque nem no leitor de tela. */}
              <b>{COLOR_LABELS[colorOption.value]}</b>
            </small>
          )}
          {segunda && <small className="seg-op">{segunda}</small>}
        </span>
      </span>
      <span className="col">{onde}</span>
      <span className="col">{etapaLabel(employee)}</span>
      <span className="col">{badge ? <span className={`tag ${ETIQUETA[tom]}`}>{badge.label}</span> : '—'}</span>
      <span className="col">{situacao}</span>
      <span className="btn btn-ink act" aria-hidden="true">Abrir ficha</span>
      <Ic n="right" s={18} className="chev" />
    </Link>
  );
}

/**
 * Lista de funcionários: linhas empilhadas, com respiro entre elas. Ao filtrar,
 * buscar ou reordenar, as linhas deslizam até o novo lugar (ver ListaViva).
 */
export function EmployeeList({ children, comCabeca = true }: { children: React.ReactNode; comCabeca?: boolean }) {
  return (
    <div className="queuebox-simples">
      {comCabeca && <EmployeeListHead />}
      <ListaViva className="queue">{children}</ListaViva>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="vazio">{children}</div>;
}

/** Mantido para não quebrar as telas que já importavam daqui. */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <CabecalhoPagina titulo={title} subtitulo={subtitle} />;
}
