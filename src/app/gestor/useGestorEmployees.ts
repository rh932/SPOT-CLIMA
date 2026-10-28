'use client';

import { apiFetch } from '@/lib/apiClient';
import { useAsyncData } from '@/components/async';
import { daysUntilDueDay, dueBadge, pendingDueDate, type DueBadge, type DueDateFields } from '@/lib/probation';
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

// ------------------------------------------------------------------
// Prazos de preenchimento. A avaliação de experiência "sobe" para o gestor
// alguns dias antes do fim do contrato e, se não for preenchida em tantos
// dias, vai para Pendências — ainda com folga antes de o contrato vencer, que
// é o limite legal. O feedback tem um prazo contado do dia em que vence.
// ------------------------------------------------------------------

/** Dias antes do fim do contrato em que a avaliação de experiência sobe para o gestor. */
export const EVALUATION_OPENS_DAYS = 10;
/** Dias que o gestor tem, depois de a avaliação subir, para preencher antes de ela virar pendência. */
export const EVALUATION_FILL_DAYS = 5;
/** Dias que o gestor tem para fazer o feedback, contando do dia em que ele vence. */
export const FEEDBACK_FILL_DAYS = 15;

/**
 * Ainda em contrato de experiência: aguardando o 1º ou o 2º período, ou
 * efetivado no 1º num setor de cores e devendo a 2ª. Deu baixa na última
 * avaliação, sai daqui e passa para o Feedback.
 */
export function isExperience(e: GestorEmployee): boolean {
  if (e.isApprentice) return false;
  if (e.status === 'HIRED') return awaitsSecond(e);
  return e.status === 'AWAITING_PERIOD_1' || e.status === 'AWAITING_PERIOD_2';
}

/** Efetivado no ciclo de cores, já sem avaliação de experiência em aberto. */
export function isFeedback(e: GestorEmployee): boolean {
  return isFeedbackCycle(e) && !awaitsSecond(e);
}

/** A avaliação de experiência já subiu para o gestor preencher. */
export function evaluationOpen(e: GestorEmployee): boolean {
  const days = daysUntilDue(e);
  return isExperience(e) && days !== null && days <= EVALUATION_OPENS_DAYS;
}

/** Subiu e não foi preenchida dentro do prazo: vai para Pendências. */
export function evaluationOverdue(e: GestorEmployee): boolean {
  const days = daysUntilDue(e);
  return isExperience(e) && days !== null && days <= EVALUATION_OPENS_DAYS - EVALUATION_FILL_DAYS;
}

/** Feedback que já venceu: entra em Pendências no dia do vencimento. */
export function feedbackDue(e: GestorEmployee): boolean {
  const days = daysUntilDue(e);
  return isFeedback(e) && days !== null && days <= 0;
}

/** Feedback vencido que passou também do prazo para fazer. */
export function feedbackLate(e: GestorEmployee): boolean {
  const days = daysUntilDue(e);
  return isFeedback(e) && days !== null && days < -FEEDBACK_FILL_DAYS;
}

/** Entra na aba Pendências. */
export function isPendencia(e: GestorEmployee): boolean {
  return evaluationOverdue(e) || feedbackDue(e);
}

/**
 * Selo do prazo na linha do colaborador. Para o feedback vencido, conta o
 * prazo para fazer em vez de anunciar "Atrasado" logo no primeiro dia — ele
 * só fica atrasado quando passa do prazo.
 */
export function prazoBadge(e: GestorEmployee): DueBadge | null {
  if (feedbackDue(e) && !feedbackLate(e)) {
    const restam = FEEDBACK_FILL_DAYS + (daysUntilDue(e) ?? 0);
    return {
      label: restam === 0 ? 'Prazo termina hoje' : `Prazo: ${restam}d`,
      className: 'text-spot-gray-800 font-semibold',
    };
  }
  if (feedbackLate(e)) {
    const atraso = -(daysUntilDue(e) ?? 0) - FEEDBACK_FILL_DAYS;
    return { label: `Atrasado (${atraso}d)`, className: 'text-[#C93A3A] font-semibold' };
  }
  return dueBadge(openDueDate(e));
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
  const { data, loading, reloading, error, forbidden, reload } = useAsyncData(
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
    forbidden,
    reload,
  };
}
