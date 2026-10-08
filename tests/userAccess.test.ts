import { describe, it, expect } from 'vitest';
import {
  accessMessage, accessOf, EMPTY_USER_FILTERS, loginUrl, matchesUserFilters, sortUsers, type AccessUser,
} from '../src/lib/userAccess';

const JK = { id: 'u2', name: 'JK' };
const COZINHA = { id: 's1', name: 'Cozinha' };

const user = (p: Partial<AccessUser> & { name: string }): AccessUser => ({
  id: p.name, email: `${p.name.toLowerCase()}@spot.com`, role: 'GESTOR', active: true,
  scopedUnits: [JK], scopedSectors: [COZINHA], scopedShifts: ['DIA'],
  firstLoginAt: null, lastLoginAt: null, ...p,
});

describe('accessOf', () => {
  it('pendente sem login, entrou com login, inativo antes de tudo', () => {
    expect(accessOf(user({ name: 'A' }))).toBe('PENDENTE');
    expect(accessOf(user({ name: 'B', firstLoginAt: '2026-09-01T10:00:00Z' }))).toBe('ENTROU');
    expect(accessOf(user({ name: 'C', active: false, firstLoginAt: '2026-09-01T10:00:00Z' }))).toBe('INATIVO');
  });
});

describe('filtros e ordem', () => {
  const lista = [
    user({ name: 'Zé', firstLoginAt: '2026-09-01T10:00:00Z' }),
    user({ name: 'Ana' }),
    user({ name: 'Bia', role: 'RH', scopedUnits: [], scopedSectors: [], scopedShifts: [] }),
  ];
  it('pendentes primeiro, depois quem entrou; por nome dentro', () => {
    expect(sortUsers(lista).map((u) => u.name)).toEqual(['Ana', 'Bia', 'Zé']);
  });
  it('busca por nome ou e-mail sem acento; filtra perfil, loja e acesso', () => {
    expect(lista.filter((u) => matchesUserFilters(u, { ...EMPTY_USER_FILTERS, q: 'ze' })).map((u) => u.name)).toEqual(['Zé']);
    expect(lista.filter((u) => matchesUserFilters(u, { ...EMPTY_USER_FILTERS, role: 'RH' })).map((u) => u.name)).toEqual(['Bia']);
    expect(lista.filter((u) => matchesUserFilters(u, { ...EMPTY_USER_FILTERS, unit: 'u2' })).length).toBe(2);
    expect(lista.filter((u) => matchesUserFilters(u, { ...EMPTY_USER_FILTERS, access: 'PENDENTE' })).length).toBe(2);
  });
});

describe('mensagem de acesso', () => {
  it('gestor vai para o portal da operação; RH para o painel', () => {
    expect(loginUrl('https://spot-clima.vercel.app/', 'GESTOR')).toBe('https://spot-clima.vercel.app/gestor/login');
    expect(loginUrl('https://spot-clima.vercel.app', 'RH')).toBe('https://spot-clima.vercel.app/admin/login');
  });
  it('traz primeiro nome, link e e-mail, e nunca a senha', () => {
    const m = accessMessage({ name: 'JOAO DA SILVA', email: 'joao.silva@spot.com', role: 'GESTOR' }, 'https://spot-clima.vercel.app');
    expect(m).toContain('Olá, Joao!');
    expect(m).toContain('https://spot-clima.vercel.app/gestor/login');
    expect(m).toContain('E-mail: joao.silva@spot.com');
    expect(m).toContain('Entre com a sua senha.');
  });
});
