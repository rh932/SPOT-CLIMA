/**
 * Avisos de movimentação — quem recebe e o que o aviso diz. Parte pura, sem I/O.
 *
 * Toda vez que alguém registra algo que muda a situação de um colaborador
 * (avaliação, treinamento, cadastro, cor), quem acompanha aquela pessoa fica
 * sabendo na hora — no sino e, principalmente, no celular.
 *
 * A regra de quem recebe tem três travas, na ordem:
 *   1. a conta está ativa, tem `notifications.receive` e não foi quem fez;
 *   2. a pessoa ENXERGA aquele assunto (`evaluations.view`, `trainings.view`,
 *      `employees.view`) — senão o aviso vazaria o que a API esconde dela.
 *      É isto que tira o Treinador dos avisos de avaliação e o Gestor dos de
 *      treinamento;
 *   3. o colaborador está no escopo dela (unidade × setor × turno). RH e
 *      Super Admin enxergam a operação inteira e não têm recorte.
 *
 * O texto segue a regra do push (ver pushPayload.ts): aparece na tela
 * bloqueada, então leva só nomes e o tipo do registro — nunca a conclusão da
 * avaliação, a cor ou o resultado do treinamento.
 */

import { hasPermission, ADMIN_ROLES, type PermissionKey, type Role } from './permissions';
import { isInScope, type ScopedEmployee } from './scope';
import type { NotifiableAdmin } from './notificationTargets';

export interface EventEmployee extends ScopedEmployee {
  id: string;
  fullName: string;
}

export type ActivityEvent =
  | { type: 'EVALUATION_SUBMITTED'; employee: EventEmployee; period: 'FIRST' | 'SECOND' | 'FEEDBACK' }
  | { type: 'TRAINING_CREATED'; employee: EventEmployee; trainingType: string; definitivo: boolean }
  /** `trainerAdminId`: quem tinha encerrado — ele precisa saber que a ficha voltou. */
  | { type: 'TRAINING_REOPENED'; employee: EventEmployee; trainingType: string; trainerAdminId: string | null }
  | { type: 'TRAINING_TYPE_CREATED'; trainingType: string }
  | { type: 'EMPLOYEE_CREATED' | 'EMPLOYEE_UPDATED' | 'EMPLOYEE_REMOVED' | 'COLOR_CHANGED'; employee: EventEmployee };

export type ActivityType = ActivityEvent['type'];

interface Rule {
  /** O que a pessoa precisa enxergar para receber o aviso. */
  permission: PermissionKey;
  /** Quem acompanha este assunto. */
  roles: Role[];
}

/** Quem supervisiona a operação e, por isso, quer saber de tudo no seu recorte. */
const SUPERVISORES: Role[] = ['GESTOR_LIDER', 'RH', 'SUPER_ADMIN'];

const RULES: Record<ActivityType, Rule> = {
  // O Gestor do turno entra: é a equipe dele, e o colega do outro turno pode
  // ter avaliado alguém que ele também acompanha.
  EVALUATION_SUBMITTED: { permission: 'evaluations.view', roles: ['GESTOR', ...SUPERVISORES] },
  COLOR_CHANGED: { permission: 'evaluations.view', roles: ['GESTOR', ...SUPERVISORES] },
  EMPLOYEE_CREATED: { permission: 'employees.view', roles: ['GESTOR', ...SUPERVISORES] },
  EMPLOYEE_UPDATED: { permission: 'employees.view', roles: ['GESTOR', ...SUPERVISORES] },
  EMPLOYEE_REMOVED: { permission: 'employees.view', roles: ['GESTOR', ...SUPERVISORES] },
  // Treinamento não é assunto do Gestor (ele não tem `trainings.view`), e o
  // Treinador não precisa saber de cada ficha dos colegas.
  TRAINING_CREATED: { permission: 'trainings.view', roles: SUPERVISORES },
  TRAINING_REOPENED: { permission: 'trainings.view', roles: SUPERVISORES },
  // Formulário novo interessa a quem aplica treinamento.
  TRAINING_TYPE_CREATED: { permission: 'trainings.view', roles: ['TREINADOR', 'GESTOR_LIDER'] },
};

function temEscopoTotal(role: string): boolean {
  return (ADMIN_ROLES as string[]).includes(role);
}

/** Destinatários de uma movimentação, na ordem em que foram passados. */
export function activityTargets<T extends NotifiableAdmin>(
  admins: T[],
  event: ActivityEvent,
  actorAdminId: string | null,
): T[] {
  const rule = RULES[event.type];
  // Quem está diretamente envolvido recebe mesmo sem ser do papel que
  // acompanha — mas continua sujeito à permissão e ao escopo.
  const envolvidos = event.type === 'TRAINING_REOPENED' && event.trainerAdminId ? [event.trainerAdminId] : [];

  return admins.filter((admin) => {
    if (!admin.active || admin.id === actorAdminId) return false;
    if (!hasPermission(admin.role, 'notifications.receive')) return false;
    if (!hasPermission(admin.role, rule.permission)) return false;
    if (!(rule.roles as string[]).includes(admin.role) && !envolvidos.includes(admin.id)) return false;
    if ('employee' in event && !temEscopoTotal(admin.role)) return isInScope(admin, event.employee);
    return true;
  });
}

const PERIODO: Record<'FIRST' | 'SECOND' | 'FEEDBACK', string> = {
  FIRST: 'de 45 dias',
  SECOND: 'de 90 dias',
  FEEDBACK: 'de feedback',
};

/** Texto do aviso — o mesmo no sino e no celular. */
export function activityMessage(event: ActivityEvent, actorName: string): string {
  const quem = actorName.trim() || 'Alguém';
  switch (event.type) {
    case 'EVALUATION_SUBMITTED':
      return `${quem} registrou a avaliação ${PERIODO[event.period]} de ${event.employee.fullName}.`;
    case 'TRAINING_CREATED':
      return event.definitivo
        ? `${quem} registrou e encerrou em definitivo o treinamento "${event.trainingType}" de ${event.employee.fullName}.`
        : `${quem} registrou o treinamento "${event.trainingType}" de ${event.employee.fullName}.`;
    case 'TRAINING_REOPENED':
      return `${quem} reabriu o treinamento "${event.trainingType}" de ${event.employee.fullName}.`;
    case 'TRAINING_TYPE_CREATED':
      return `Novo formulário de treinamento disponível: "${event.trainingType}".`;
    case 'EMPLOYEE_CREATED':
      return `${quem} cadastrou ${event.employee.fullName} como novo colaborador.`;
    case 'EMPLOYEE_UPDATED':
      return `${quem} atualizou o cadastro de ${event.employee.fullName}.`;
    case 'EMPLOYEE_REMOVED':
      return `${quem} excluiu o cadastro de ${event.employee.fullName}.`;
    case 'COLOR_CHANGED':
      return `${quem} reclassificou a cor de ${event.employee.fullName}.`;
  }
}

/**
 * Colaborador ao qual o aviso fica ligado. Exclusão não liga: a linha do
 * colaborador some e, pelo cascade, levaria o próprio aviso junto.
 */
export function activityEmployeeId(event: ActivityEvent): string | null {
  if (!('employee' in event) || event.type === 'EMPLOYEE_REMOVED') return null;
  return event.employee.id;
}
