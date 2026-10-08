import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, hasPermission,
  GESTOR_ROLES, GESTOR_PORTAL_ROLES, ADMIN_ROLES, hasUnrestrictedScope,
} from '../src/lib/permissions';

describe('catálogo de permissões', () => {
  it('não tem chaves duplicadas', () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('todo papel só referencia chaves que existem no catálogo', () => {
    const keys = new Set(PERMISSIONS.map((p) => p.key));
    for (const granted of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const key of granted) expect(keys.has(key)).toBe(true);
    }
  });
});

describe('hasPermission', () => {
  it('SUPER_ADMIN e RH têm acesso administrativo completo', () => {
    for (const role of ['SUPER_ADMIN', 'RH']) {
      expect(hasPermission(role, 'users.manage')).toBe(true);
      expect(hasPermission(role, 'audit.view')).toBe(true);
      expect(hasPermission(role, 'surveys.manage')).toBe(true);
    }
  });

  it('GESTOR só tem permissões da própria equipe', () => {
    expect(hasPermission('GESTOR', 'evaluations.create')).toBe(true);
    expect(hasPermission('GESTOR', 'employees.summary.view')).toBe(true);
    expect(hasPermission('GESTOR', 'users.manage')).toBe(false);
    expect(hasPermission('GESTOR', 'settings.manage')).toBe(false);
  });

  it('GESTOR_LIDER enxerga avaliações E treinamentos, sem executar nenhum dos dois', () => {
    // Vê os dois lados da operação...
    expect(hasPermission('GESTOR_LIDER', 'evaluations.view')).toBe(true);
    expect(hasPermission('GESTOR_LIDER', 'evaluations.history.view')).toBe(true);
    expect(hasPermission('GESTOR_LIDER', 'trainings.view')).toBe(true);
    expect(hasPermission('GESTOR_LIDER', 'trainings.history.view')).toBe(true);
    expect(hasPermission('GESTOR_LIDER', 'reports.view')).toBe(true);
    // ...mas quem avalia é o gestor do turno e quem treina é o treinador.
    expect(hasPermission('GESTOR_LIDER', 'evaluations.create')).toBe(false);
    expect(hasPermission('GESTOR_LIDER', 'trainings.create')).toBe(false);
    // E nada de administração.
    expect(hasPermission('GESTOR_LIDER', 'users.manage')).toBe(false);
  });

  it('GESTOR não enxerga treinamento; TREINADOR não enxerga avaliação', () => {
    expect(hasPermission('GESTOR', 'trainings.view')).toBe(false);
    expect(hasPermission('GESTOR', 'trainings.history.view')).toBe(false);
    expect(hasPermission('TREINADOR', 'evaluations.view')).toBe(false);
    expect(hasPermission('TREINADOR', 'evaluations.history.view')).toBe(false);
  });

  it('papel desconhecido não recebe nada', () => {
    expect(hasPermission('QUALQUER_COISA', 'employees.view')).toBe(false);
  });
});

describe('TREINADOR', () => {
  it('pode treinar e ver o histórico de treinamentos', () => {
    expect(hasPermission('TREINADOR', 'employees.view')).toBe(true);
    expect(hasPermission('TREINADOR', 'trainings.view')).toBe(true);
    expect(hasPermission('TREINADOR', 'trainings.create')).toBe(true);
    expect(hasPermission('TREINADOR', 'trainings.history.view')).toBe(true);
  });

  it('NÃO acessa avaliação de experiência nem feedback de gestão', () => {
    expect(hasPermission('TREINADOR', 'evaluations.view')).toBe(false);
    expect(hasPermission('TREINADOR', 'evaluations.create')).toBe(false);
    expect(hasPermission('TREINADOR', 'evaluations.edit')).toBe(false);
    expect(hasPermission('TREINADOR', 'evaluations.history.view')).toBe(false);
    expect(hasPermission('TREINADOR', 'employees.summary.view')).toBe(false);
  });

  it('NÃO acessa nada administrativo', () => {
    for (const key of ['users.manage', 'settings.manage', 'audit.view', 'managers.manage', 'surveys.manage', 'reports.view'] as const) {
      expect(hasPermission('TREINADOR', key)).toBe(false);
    }
  });

  it('não é um Gestor com menos opções — as listas são independentes', () => {
    const treinador = DEFAULT_ROLE_PERMISSIONS.TREINADOR;
    const gestor = DEFAULT_ROLE_PERMISSIONS.GESTOR;
    // O treinador tem permissões que o gestor não tem, e vice-versa.
    expect(treinador.some((k) => !gestor.includes(k))).toBe(true);
    expect(gestor.some((k) => !treinador.includes(k))).toBe(true);
  });
});

describe('exclusão de funcionário', () => {
  it('ADMIN (SUPER_ADMIN/RH) pode excluir', () => {
    expect(hasPermission('SUPER_ADMIN', 'employees.delete')).toBe(true);
    expect(hasPermission('RH', 'employees.delete')).toBe(true);
  });

  it('Gestor Líder pode excluir — é quem limpa a lista de quem está em treinamento', () => {
    expect(hasPermission('GESTOR_LIDER', 'employees.delete')).toBe(true);
  });

  it('Gestor comum e Treinador NÃO podem excluir', () => {
    expect(hasPermission('GESTOR', 'employees.delete')).toBe(false);
    expect(hasPermission('TREINADOR', 'employees.delete')).toBe(false);
  });
});

describe('cadastro de funcionário', () => {
  it('Treinador pode cadastrar quem chega para treinar', () => {
    expect(hasPermission('TREINADOR', 'employees.create')).toBe(true);
  });

  it('mas não pode editar nem excluir', () => {
    expect(hasPermission('TREINADOR', 'employees.edit')).toBe(false);
    expect(hasPermission('TREINADOR', 'employees.delete')).toBe(false);
  });
});

describe('acesso do SUPER_ADMIN ao portal da operação', () => {
  it('entra no portal da operação junto com gestor, líder e treinador', () => {
    expect(GESTOR_PORTAL_ROLES).toContain('SUPER_ADMIN');
    for (const role of GESTOR_ROLES) expect(GESTOR_PORTAL_ROLES).toContain(role);
  });

  // O RH acompanha pelo /admin, que mostra a mesma informação em painel.
  it('não arrasta o RH junto', () => {
    expect(GESTOR_PORTAL_ROLES).not.toContain('RH');
    expect(ADMIN_ROLES).toContain('RH');
  });

  it('é o único papel que enxerga a operação sem recorte', () => {
    expect(hasUnrestrictedScope('SUPER_ADMIN')).toBe(true);
    for (const role of ['RH', 'GESTOR', 'GESTOR_LIDER', 'TREINADOR']) {
      expect(hasUnrestrictedScope(role)).toBe(false);
    }
  });

  // "Mesmo acesso que o Gestor Líder": tudo que o Líder faz, o Super Admin faz.
  it('tem todas as permissões do Gestor Líder', () => {
    for (const key of DEFAULT_ROLE_PERMISSIONS.GESTOR_LIDER) {
      expect(hasPermission('SUPER_ADMIN', key)).toBe(true);
    }
  });

  // Quem preenche a avaliação continua sendo o gestor do turno — a regra de
  // canEvaluate() não muda por o Super Admin ter entrado no portal.
  it('supervisiona treinamento em vez de aparecer como quem treina', () => {
    expect(hasPermission('SUPER_ADMIN', 'trainings.reopen')).toBe(true);
    expect(hasPermission('GESTOR_LIDER', 'trainings.reopen')).toBe(true);
    expect(hasPermission('TREINADOR', 'trainings.reopen')).toBe(false);
  });
});
