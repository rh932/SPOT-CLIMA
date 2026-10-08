import type { ActivityType } from './notificationEvents';

/**
 * Conteúdo de um aviso no celular — parte pura, sem I/O.
 *
 * Fica separada de `push.ts` (que fala com o serviço de push e com o banco)
 * para poder ser testada e para deixar explícito o contrato com o service
 * worker: o `sw.js` lê exatamente estes campos.
 *
 * Regra do conteúdo: o aviso carrega o MESMO que já aparece no sino — nome do
 * colaborador e prazo. Nada além disso. Uma notificação aparece na tela
 * bloqueada do telefone, à vista de quem estiver por perto.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Para onde o toque leva, sempre um caminho do próprio site. */
  url: string;
  /**
   * Agrupa avisos: um `tag` repetido SUBSTITUI a notificação anterior em vez
   * de empilhar. Assim o lembrete de 3 dias troca o de 7 do mesmo
   * colaborador, e o celular não acumula três avisos do mesmo assunto.
   */
  tag: string;
}

/** SYSTEM_ALERT: falha da rotina diária, só para o Super Admin (ver src/lib/cronStatus.ts). */
export type NotificationType = 'FEEDBACK_REMINDER' | 'EVALUATION_REMINDER' | 'SYSTEM_ALERT' | ActivityType;
export type Portal = 'admin' | 'gestor';

const TITULOS: Record<ActivityType, string> = {
  EVALUATION_SUBMITTED: 'avaliação registrada',
  TRAINING_CREATED: 'novo treinamento',
  TRAINING_REOPENED: 'treinamento reaberto',
  TRAINING_TYPE_CREATED: 'novo formulário de treinamento',
  EMPLOYEE_CREATED: 'novo colaborador',
  EMPLOYEE_UPDATED: 'cadastro atualizado',
  EMPLOYEE_REMOVED: 'cadastro excluído',
  COLOR_CHANGED: 'cor reclassificada',
};

/** Título curto do aviso; o detalhe vai no corpo. */
export function notificationTitle(type: NotificationType, offsetDays: number | null = null): string {
  const atrasado = offsetDays !== null && offsetDays < 0;
  if (type === 'FEEDBACK_REMINDER') return `SPOT CLIMA — ${atrasado ? 'feedback atrasado' : 'feedback a vencer'}`;
  if (type === 'EVALUATION_REMINDER') return `SPOT CLIMA — ${atrasado ? 'avaliação atrasada' : 'avaliação a vencer'}`;
  if (type === 'SYSTEM_ALERT') return 'SPOT CLIMA — alerta do sistema';
  return `SPOT CLIMA — ${TITULOS[type]}`;
}

/**
 * Para onde o toque no aviso leva. Depende do portal em que o aparelho foi
 * inscrito: o mesmo Super Admin pode ter o celular no /gestor e o computador
 * no /admin, e cada um abre a ficha no painel que ele usa ali.
 */
export function notificationUrl(type: NotificationType, employeeId: string | null, portal: Portal): string {
  const base = portal === 'gestor' ? '/gestor' : '/admin';
  if (type === 'SYSTEM_ALERT') return portal === 'admin' ? '/admin/settings#rotina' : base;
  if (employeeId) return `${base}/employees/${employeeId}`;
  if (type === 'TRAINING_TYPE_CREATED') return portal === 'gestor' ? '/gestor/treinamento' : '/admin/trainings';
  if (type === 'EMPLOYEE_REMOVED' && portal === 'admin') return '/admin/employees';
  return base;
}

/**
 * `tag` do aviso. Lembretes do mesmo colaborador se substituem (o de 3 dias
 * troca o de 7). Movimentações se substituem só dentro do mesmo tipo: a
 * avaliação registrada não pode sumir porque, em seguida, alguém mexeu no
 * cadastro da mesma pessoa.
 */
export function notificationTag(type: NotificationType, employeeId: string | null): string {
  if (type === 'FEEDBACK_REMINDER') return `feedback-${employeeId}`;
  if (type === 'EVALUATION_REMINDER') return `avaliacao-${employeeId}`;
  return `${type.toLowerCase()}-${employeeId ?? 'geral'}`;
}

export function notificationPayload({
  type, employeeId, message, portal, offsetDays = null,
}: {
  type: NotificationType;
  employeeId: string | null;
  message: string;
  portal: Portal;
  offsetDays?: number | null;
}): PushPayload {
  return {
    title: notificationTitle(type, offsetDays),
    body: message,
    url: notificationUrl(type, employeeId, portal),
    tag: notificationTag(type, employeeId),
  };
}

export function feedbackReminderPayload({
  employeeId,
  message,
  portal,
}: {
  employeeId: string;
  employeeName: string;
  message: string;
  portal: Portal;
}): PushPayload {
  return notificationPayload({ type: 'FEEDBACK_REMINDER', employeeId, message, portal });
}
