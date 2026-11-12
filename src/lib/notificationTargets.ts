/**
 * Quem recebe o aviso de um feedback que está chegando — regra pura.
 *
 * Não existe login para o funcionário avaliado: aviso é sempre para usuário
 * interno. Recebe quem cumpre as três condições:
 *   1. tem a permissão `notifications.receive`;
 *   2. tem o funcionário dentro do próprio escopo (unidade × setor × turno);
 *   3. é GESTOR (quem preenche) ou GESTOR_LIDER (quem acompanha e cobra).
 *
 * O TREINADOR também tem `notifications.receive`, mas não enxerga avaliação —
 * avisar sobre feedback seria vazar por notificação um dado que a API esconde
 * dele. Por isso o filtro é por papel, e não só por permissão.
 */

import { hasPermission } from './permissions';
import { isInScope, type GestorScope, type ScopedEmployee } from './scope';

/** Papéis de operação que acompanham o ciclo de feedback. */
const FEEDBACK_ROLES = ['GESTOR', 'GERENTE', 'GERENTE_AVALIADOR', 'GESTOR_LIDER'];

export interface NotifiableAdmin extends GestorScope {
  id: string;
  role: string;
  active: boolean;
}

export function shouldNotify(admin: NotifiableAdmin, employee: ScopedEmployee): boolean {
  if (!admin.active) return false;
  if (!FEEDBACK_ROLES.includes(admin.role)) return false;
  if (!hasPermission(admin.role, 'notifications.receive')) return false;
  return isInScope(admin, employee);
}

/** Destinatários de um aviso, na ordem em que foram passados. */
export function notificationTargets(admins: NotifiableAdmin[], employee: ScopedEmployee): NotifiableAdmin[] {
  return admins.filter((admin) => shouldNotify(admin, employee));
}
