import { describe, it, expect } from 'vitest';
import {
  activityTargets, activityMessage, activityEmployeeId, type ActivityEvent,
} from '../src/lib/notificationEvents';
import type { NotifiableAdmin } from '../src/lib/notificationTargets';

const employee = { id: 'e1', fullName: 'Heloisa Mendonça', unitId: 'u1', sectorId: 's1', shift: 'DIA' };

const conta = (id: string, role: string, over: Partial<NotifiableAdmin> = {}): NotifiableAdmin => ({
  id,
  role,
  active: true,
  scopedUnitIds: ['u1'],
  scopedSectorIds: ['s1'],
  scopedShifts: ['DIA'],
  ...over,
});

const gestor = conta('gestor', 'GESTOR');
const lider = conta('lider', 'GESTOR_LIDER');
const treinador = conta('treinador', 'TREINADOR');
// RH e Super Admin não têm linhas de escopo — enxergam a operação inteira.
const rh = conta('rh', 'RH', { scopedUnitIds: [], scopedSectorIds: [], scopedShifts: [] });
const superAdmin = conta('sa', 'SUPER_ADMIN', { scopedUnitIds: [], scopedSectorIds: [], scopedShifts: [] });
const todos = [gestor, lider, treinador, rh, superAdmin];

const ids = (event: ActivityEvent, actor: string | null = null, admins = todos) =>
  activityTargets(admins, event, actor).map((a) => a.id).sort();

describe('activityTargets', () => {
  it('avaliação registrada: gestor, líder e administração — nunca o treinador', () => {
    expect(ids({ type: 'EVALUATION_SUBMITTED', employee, period: 'FIRST' })).toEqual(['gestor', 'lider', 'rh', 'sa']);
  });

  it('quem fez não recebe o aviso da própria ação', () => {
    expect(ids({ type: 'EVALUATION_SUBMITTED', employee, period: 'FIRST' }, 'gestor')).toEqual(['lider', 'rh', 'sa']);
  });

  it('treinamento registrado: supervisores, e não o gestor (que não vê treinamento)', () => {
    const event: ActivityEvent = { type: 'TRAINING_CREATED', employee, trainingType: 'Salão', definitivo: false };
    expect(ids(event, 'treinador')).toEqual(['lider', 'rh', 'sa']);
  });

  it('treinamento reaberto avisa também o treinador que tinha encerrado', () => {
    const event: ActivityEvent = { type: 'TRAINING_REOPENED', employee, trainingType: 'Salão', trainerAdminId: 'treinador' };
    expect(ids(event, 'lider')).toEqual(['rh', 'sa', 'treinador']);
  });

  it('o envolvido continua preso ao escopo', () => {
    const fora = conta('treinador', 'TREINADOR', { scopedShifts: ['NOITE'] });
    const event: ActivityEvent = { type: 'TRAINING_REOPENED', employee, trainingType: 'Salão', trainerAdminId: 'treinador' };
    expect(ids(event, 'lider', [fora])).toEqual([]);
  });

  it('formulário novo de treinamento vai para quem treina, sem recorte de escopo', () => {
    const noutroTurno = conta('t2', 'TREINADOR', { scopedShifts: ['NOITE'] });
    expect(ids({ type: 'TRAINING_TYPE_CREATED', trainingType: 'Bar' }, 'rh', [...todos, noutroTurno]))
      .toEqual(['lider', 't2', 'treinador']);
  });

  it.each([['EMPLOYEE_CREATED'], ['EMPLOYEE_UPDATED'], ['EMPLOYEE_REMOVED'], ['COLOR_CHANGED']] as const)(
    '%s: gestor, líder e administração',
    (type) => {
      expect(ids({ type, employee } as ActivityEvent)).toEqual(['gestor', 'lider', 'rh', 'sa']);
    },
  );

  it.each<[string, Partial<NotifiableAdmin>]>([
    ['outra unidade', { scopedUnitIds: ['u2'] }],
    ['outro setor', { scopedSectorIds: ['s2'] }],
    ['outro turno', { scopedShifts: ['NOITE'] }],
  ])('não avisa gestor de %s', (_, over) => {
    expect(ids({ type: 'EMPLOYEE_CREATED', employee }, null, [conta('g', 'GESTOR', over)])).toEqual([]);
  });

  it('não avisa conta desativada', () => {
    expect(ids({ type: 'EMPLOYEE_CREATED', employee }, null, [conta('g', 'GESTOR', { active: false })])).toEqual([]);
  });
});

describe('activityMessage', () => {
  it('diz quem fez, o quê e com quem', () => {
    expect(activityMessage({ type: 'EVALUATION_SUBMITTED', employee, period: 'SECOND' }, 'Carlos'))
      .toBe('Carlos registrou a avaliação de 90 dias de Heloisa Mendonça.');
    expect(activityMessage({ type: 'TRAINING_CREATED', employee, trainingType: 'Salão', definitivo: true }, 'Ana'))
      .toContain('encerrou em definitivo o treinamento "Salão"');
  });

  // O aviso aparece na tela bloqueada do celular.
  it('não expõe conclusão, cor nem resultado', () => {
    const textos = [
      activityMessage({ type: 'EVALUATION_SUBMITTED', employee, period: 'FIRST' }, 'Carlos'),
      activityMessage({ type: 'COLOR_CHANGED', employee }, 'Carlos'),
      activityMessage({ type: 'TRAINING_CREATED', employee, trainingType: 'Salão', definitivo: false }, 'Ana'),
    ].join(' ');
    expect(textos).not.toMatch(/DEMITIR|EFETIVAR|VERMELHO|AMARELO|VERDE|REPROVADO|APROVADO/i);
  });

  it('não quebra sem o nome de quem fez', () => {
    expect(activityMessage({ type: 'EMPLOYEE_UPDATED', employee }, '')).toMatch(/^Alguém atualizou/);
  });
});

describe('activityEmployeeId', () => {
  it('liga o aviso ao colaborador', () => {
    expect(activityEmployeeId({ type: 'EMPLOYEE_CREATED', employee })).toBe('e1');
  });

  // Ligado ao colaborador excluído, o cascade apagaria o próprio aviso.
  it('não liga o aviso de exclusão', () => {
    expect(activityEmployeeId({ type: 'EMPLOYEE_REMOVED', employee })).toBeNull();
  });
});
