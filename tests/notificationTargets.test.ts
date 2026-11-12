import { describe, it, expect } from 'vitest';
import { notificationTargets, shouldNotify, type NotifiableAdmin } from '../src/lib/notificationTargets';

const employee = { unitId: 'u1', sectorId: 's1', shift: 'DIA' };

const admin = (over: Partial<NotifiableAdmin> = {}): NotifiableAdmin => ({
  id: 'a1',
  role: 'GESTOR',
  active: true,
  scopedUnitIds: ['u1'],
  scopedSectorIds: ['s1'],
  scopedShifts: ['DIA'],
  ...over,
});

describe('shouldNotify', () => {
  it('avisa o gestor do turno', () => {
    expect(shouldNotify(admin(), employee)).toBe(true);
  });

  it('avisa o gestor líder, que acompanha sem avaliar', () => {
    expect(shouldNotify(admin({ role: 'GESTOR_LIDER' }), employee)).toBe(true);
  });

  it('não avisa o treinador, que não enxerga avaliação', () => {
    expect(shouldNotify(admin({ role: 'TREINADOR' }), employee)).toBe(false);
  });

  it.each([['SUPER_ADMIN'], ['RH']])('não avisa %s pelo escopo da operação', (role) => {
    expect(shouldNotify(admin({ role }), employee)).toBe(false);
  });

  it('não avisa conta desativada', () => {
    expect(shouldNotify(admin({ active: false }), employee)).toBe(false);
  });

  it.each<[string, Partial<NotifiableAdmin>]>([
    ['outra unidade', { scopedUnitIds: ['u2'] }],
    ['outro setor', { scopedSectorIds: ['s2'] }],
    ['outro turno', { scopedShifts: ['NOITE'] }],
  ])('não avisa quem está fora do escopo: %s', (_label, over) => {
    expect(shouldNotify(admin(over), employee)).toBe(false);
  });

  it('avisa quem cobre vários setores e os dois turnos', () => {
    const lider = admin({
      role: 'GESTOR_LIDER',
      scopedSectorIds: ['s1', 's2', 's3'],
      scopedShifts: ['DIA', 'NOITE'],
    });
    expect(shouldNotify(lider, employee)).toBe(true);
    expect(shouldNotify(lider, { ...employee, shift: 'NOITE' })).toBe(true);
  });
});

describe('notificationTargets', () => {
  it('devolve só quem deve ser avisado', () => {
    const admins = [
      admin({ id: 'gestor-dia' }),
      admin({ id: 'gestor-noite', scopedShifts: ['NOITE'] }),
      admin({ id: 'lider', role: 'GESTOR_LIDER', scopedShifts: ['DIA', 'NOITE'] }),
      admin({ id: 'treinador', role: 'TREINADOR' }),
      admin({ id: 'rh', role: 'RH' }),
    ];
    expect(notificationTargets(admins, employee).map((a) => a.id)).toEqual(['gestor-dia', 'lider']);
  });

  it('lista vazia quando ninguém cobre o funcionário', () => {
    expect(notificationTargets([admin({ scopedUnitIds: ['u9'] })], employee)).toEqual([]);
  });
});
