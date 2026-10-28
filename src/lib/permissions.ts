/**
 * Matriz de permissões do Spot Integra (RBAC).
 *
 * Cada papel tem um conjunto PRÓPRIO de permissões — o Treinador não é "um
 * gestor com menos opções": ele tem a lista dele, que não inclui nada de
 * avaliação de experiência, feedback de gestão ou administração.
 *
 * Quem aplica isto de verdade é o backend: `requirePermission()` em
 * src/lib/apiAuth.ts. Esconder menu não bloqueia nada.
 */

export type PermissionKey =
  // Funcionários
  | 'employees.view'
  | 'employees.create'
  | 'employees.edit'
  | 'employees.delete'
  | 'employees.summary.view'
  | 'employees.color.edit'
  // Avaliação de experiência (45/90 dias) — gestão
  | 'evaluations.view'
  | 'evaluations.create'
  | 'evaluations.edit'
  | 'evaluations.history.view'
  // Treinamento
  | 'trainings.view'
  | 'trainings.create'
  | 'trainings.history.view'
  | 'trainings.manage'
  | 'trainings.reopen'
  // Transversais
  | 'notifications.receive'
  | 'reports.view'
  | 'surveys.manage'
  | 'managers.manage'
  | 'users.manage'
  | 'settings.manage'
  | 'audit.view';

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  category: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'employees.view', label: 'Visualizar funcionários', category: 'Funcionários' },
  { key: 'employees.create', label: 'Cadastrar funcionário', category: 'Funcionários' },
  { key: 'employees.edit', label: 'Editar funcionário', category: 'Funcionários' },
  { key: 'employees.delete', label: 'Excluir funcionário', category: 'Funcionários' },
  { key: 'employees.summary.view', label: 'Visualizar resumo do funcionário', category: 'Funcionários' },
  { key: 'employees.color.edit', label: 'Reclassificar cor do colaborador', category: 'Funcionários' },

  { key: 'evaluations.view', label: 'Visualizar avaliações de experiência', category: 'Avaliações' },
  { key: 'evaluations.create', label: 'Realizar avaliação de experiência', category: 'Avaliações' },
  { key: 'evaluations.edit', label: 'Editar avaliação de experiência', category: 'Avaliações' },
  { key: 'evaluations.history.view', label: 'Histórico de avaliações', category: 'Avaliações' },

  { key: 'trainings.view', label: 'Visualizar treinamentos', category: 'Treinamento' },
  { key: 'trainings.create', label: 'Realizar treinamento', category: 'Treinamento' },
  { key: 'trainings.history.view', label: 'Histórico de treinamentos', category: 'Treinamento' },
  { key: 'trainings.manage', label: 'Gerenciar tipos e materiais de treinamento', category: 'Treinamento' },
  { key: 'trainings.reopen', label: 'Reabrir treinamento encerrado em definitivo', category: 'Treinamento' },

  { key: 'notifications.receive', label: 'Receber notificações', category: 'Notificações' },
  { key: 'reports.view', label: 'Visualizar relatórios', category: 'Relatórios' },
  { key: 'surveys.manage', label: 'Gerenciar pesquisas', category: 'Pesquisa de clima' },
  { key: 'managers.manage', label: 'Gerenciar gestores', category: 'Administração' },
  { key: 'users.manage', label: 'Gerenciar usuários', category: 'Administração' },
  { key: 'settings.manage', label: 'Configurações do sistema', category: 'Administração' },
  { key: 'audit.view', label: 'Auditoria', category: 'Administração' },
];

export type Role = 'SUPER_ADMIN' | 'RH' | 'GESTOR' | 'GESTOR_LIDER' | 'TREINADOR';

const ALL_KEYS = PERMISSIONS.map((p) => p.key);

/** Avaliação de experiência da própria equipe — base do Gestor. */
const GESTAO_KEYS: PermissionKey[] = [
  'employees.view',
  'employees.summary.view',
  // Reclassificar fora da avaliação: o gestor percebe a mudança de postura no
  // meio do ciclo e ajusta a cadência sem esperar o próximo feedback.
  'employees.color.edit',
  'evaluations.view',
  'evaluations.create',
  'evaluations.history.view',
  // O gestor do salão também conclui o treinamento da equipe dele.
  'trainings.view',
  'trainings.create',
  'trainings.history.view',
  'notifications.receive',
];

/**
 * Lista própria do Treinador — deliberadamente NÃO derivada de GESTAO_KEYS.
 * Ele enxerga funcionários para poder treiná-los, e nada de avaliação de
 * experiência, feedback de gestão ou administração.
 */
const TREINADOR_KEYS: PermissionKey[] = [
  'employees.view',
  // O treinador cadastra quem chega para treinar — mas não edita nem exclui.
  'employees.create',
  'trainings.view',
  'trainings.create',
  'trainings.history.view',
  'notifications.receive',
];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  SUPER_ADMIN: ALL_KEYS,
  RH: ALL_KEYS,
  // Gestor: avaliação de experiência e treinamento da equipe dele.
  GESTOR: GESTAO_KEYS,
  /**
   * Gestor Líder: enxerga os dois lados da operação — avaliações E
   * treinamentos. Continua sem executar nenhum dos dois (quem avalia é o
   * gestor do turno, quem treina é o treinador): ele acompanha, cobra e é
   * quem limpa a lista, por isso tem `employees.delete`. O escopo (várias
   * unidades/setores/turnos) é configurado pelo ADM.
   */
  GESTOR_LIDER: [
    'employees.view',
    'employees.summary.view',
    // Ele não avalia, mas corrige: é quem conserta uma cor errada sem
    // depender do RH.
    'employees.color.edit',
    'employees.delete',
    'evaluations.view',
    'evaluations.history.view',
    'trainings.view',
    // Gerente treinador: também registra e conclui o treinamento.
    'trainings.create',
    'trainings.history.view',
    // Reabrir um encerramento definitivo é justamente o papel de quem
    // acompanha e corrige a operação — não de quem registrou o treinamento.
    'trainings.reopen',
    'reports.view',
    'notifications.receive',
  ],
  // Treinador: só treinamento. Nada de avaliação de experiência.
  TREINADOR: TREINADOR_KEYS,
};

export function hasPermission(role: string, key: PermissionKey): boolean {
  const keys = DEFAULT_ROLE_PERMISSIONS[role as Role];
  return keys ? keys.includes(key) : false;
}

export function permissionsFor(role: string): PermissionKey[] {
  return DEFAULT_ROLE_PERMISSIONS[role as Role] ?? [];
}

/** Papéis que operam no portal administrativo. */
export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'RH'];
/**
 * Papéis do portal da operação (/gestor). Gestor, Líder e Treinador entram
 * pela mesma porta — o que cada um vê é decidido pelas permissões, não por
 * ter um site separado.
 */
export const GESTOR_ROLES: Role[] = ['GESTOR', 'GESTOR_LIDER', 'TREINADOR'];

/**
 * Quem consegue ENTRAR no portal da operação.
 *
 * O SUPER_ADMIN entra junto para acompanhar a operação com o mesmo alcance do
 * Gestor Líder — ele já tem todas as permissões, mas sem estar nesta lista não
 * conseguia sequer logar em /gestor. Continua não avaliando: quem preenche a
 * avaliação é o gestor do turno (ver `canEvaluate` em src/lib/scope.ts).
 *
 * O RH fica de fora de propósito: o acompanhamento dele é pelo /admin, que já
 * mostra a mesma informação em formato de painel.
 */
export const GESTOR_PORTAL_ROLES: Role[] = [...GESTOR_ROLES, 'SUPER_ADMIN'];

/**
 * Papéis que enxergam a operação inteira, sem recorte de unidade/setor/turno.
 *
 * Eles não têm linhas em admin_units/admin_sectors/admin_shifts — em vez de
 * tratar isso como "escopo vazio" (que esconderia tudo), `requireGestor()`
 * preenche o escopo com TODAS as unidades, setores e turnos existentes. Assim
 * toda a lógica de escopo continua valendo sem um caso especial espalhado por
 * cada rota.
 */
export const UNRESTRICTED_SCOPE_ROLES: Role[] = ['SUPER_ADMIN'];

export function hasUnrestrictedScope(role: string): boolean {
  return UNRESTRICTED_SCOPE_ROLES.includes(role as Role);
}
