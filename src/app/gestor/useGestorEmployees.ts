'use client';

import { apiFetch } from '@/lib/apiClient';
import { useAsyncData } from '@/components/async';
import { daysUntilDueDay, pendingDueDate, type DueDateFields } from '@/lib/probation';
import type { FeedbackColor } from '@/lib/feedbackCycle';
import { awaitsSecondEvaluation } from '@/lib/colorUnlock';

export interface GestorEmployee extends DueDateFields {
  id: string;
  fullName: string;
  admissionDate: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  currentColor: FeedbackColor | null;
  nextFeedbackDueDate: string | null;
  sector: { name: string; usesColorCycle: boolean } | null;
  unit: { name: string } | null;
  evaluations: {
    id: string;
    period: 'FIRST' | 'SECOND' | 'FEEDBACK';
    cycleNumber: number;
    evaluationDate: string;
    color: FeedbackColor | null;
    classification: string;
    conclusion: string | null;
    evaluator: { id: string; name: string } | null;
    /** Avaliador sem conta no sistema (respostas importadas do Forms). */
    evaluatorName: string | null;
  }[];
  /** Outro gestor já respondeu o período e este ainda pode dar a 2ª resposta (setor com dois gestores). */
  secondOpinion?: { period: 'FIRST' | 'SECOND'; until: string } | null;
}

export const STATUS_LABEL: Record<GestorEmployee['status'], string> = {
  AWAITING_PERIOD_1: 'Aguardando 1º ciclo',
  AWAITING_PERIOD_2: 'Aguardando 2º ciclo',
  HIRED: 'Efetivado',
  TERMINATED: 'Desligado',
};

export const SHIFT_LABEL: Record<'DIA' | 'NOITE', string> = { DIA: 'Diurno', NOITE: 'Noturno' };

/** Uma avaliação entra em "Pendências" quando falta 7 dias ou menos — ou já venceu. */
export const URGENT_DAYS = 7;

/**
 * O colaborador está no ciclo permanente de feedback?
 *
 * Não basta estar efetivado com data marcada: o setor dele precisa participar
 * do projeto de cores. Existem efetivados com cor e data de antes de o ciclo
 * virar exclusividade do Salão — para eles o prazo não vale mais, e mostrá-lo
 * colocaria na fila do gestor um feedback que a rota de avaliação recusa.
 */
export function isFeedbackCycle(e: GestorEmployee): boolean {
  // Aprendiz não tem ciclo de feedback: a rota de avaliação o recusa.
  return e.status === 'HIRED' && !e.isApprentice && Boolean(e.nextFeedbackDueDate) && Boolean(e.sector?.usesColorCycle);
}

/**
 * Efetivado na 1ª avaliação num setor do projeto de cores: a 2ª avaliação de
 * experiência (90 dias) continua devida, e só depois dela a cor é liberada.
 */
export function awaitsSecond(e: GestorEmployee): boolean {
  return awaitsSecondEvaluation({
    status: e.status,
    isApprentice: e.isApprentice,
    currentColor: e.currentColor,
    usesColorCycle: Boolean(e.sector?.usesColorCycle),
    evaluations: e.evaluations ?? [],
  });
}

/**
 * Prazo em aberto do colaborador: o do ciclo de experiência enquanto ele está
 * em experiência, e o do próximo feedback depois de efetivado.
 */
export function openDueDate(e: GestorEmployee): Date | null {
  if (e.status === 'HIRED') {
    if (awaitsSecond(e)) return new Date(e.period2DueDate);
    return isFeedbackCycle(e) ? new Date(e.nextFeedbackDueDate!) : null;
  }
  return pendingDueDate(e);
}

export function daysUntilDue(e: GestorEmployee): number | null {
  const due = openDueDate(e);
  if (!due) return null;
  return daysUntilDueDay(due);
}

/** Efetivado no ciclo permanente também conta como pendente do próximo feedback. */
export function isPending(e: GestorEmployee): boolean {
  if (e.status === 'HIRED') return awaitsSecond(e) || isFeedbackCycle(e);
  return e.status === 'AWAITING_PERIOD_1' || e.status === 'AWAITING_PERIOD_2';
}

/** Vencidas e as que vencem nos próximos dias — o que o gestor precisa fazer agora. */
export function isUrgent(e: GestorEmployee): boolean {
  if (!isPending(e)) return false;
  const days = daysUntilDue(e);
  return days !== null && days <= URGENT_DAYS;
}

/**
 * Fetch único da lista do gestor, compartilhado pelas abas do painel.
 *
 * Devolve `reload` porque as abas (Equipe, Pendências, Próximas, Histórico)
 * precisam oferecer "Tentar de novo" sem obrigar a recarregar a página — no
 * celular, recarregar custa uma nova autenticação de rede e o gestor
 * frequentemente desiste.
 */
export function useGestorEmployees() {
  const { data, loading, reloading, error, reload } = useAsyncData(
    (signal) => apiFetch<{ employees: GestorEmployee[]; canEvaluate: boolean }>('/api/gestor/employees', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar a sua equipe.' },
  );

  return {
    employees: data?.employees ?? [],
    // `true` enquanto não se sabe: o texto da tela fala em avaliar, e começar
    // dizendo "você não avalia" para depois corrigir é pior que esperar.
    canEvaluate: data?.canEvaluate ?? true,
    loading,
    reloading,
    error,
    reload,
  };
}
