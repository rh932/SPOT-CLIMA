import { describe, it, expect } from 'vitest';
import { normalizeName, findDuplicate, cycleFieldsFor } from '../src/lib/employeeCreate';

describe('normalizeName', () => {
  it('ignora acento, caixa e espaços repetidos', () => {
    expect(normalizeName('  JOÃO   da  Silva ')).toBe('joao da silva');
  });
});

describe('findDuplicate', () => {
  const base = [
    { id: '1', fullName: 'Maria José', unitId: 'paulista' },
    { id: '2', fullName: 'Pedro Alves', unitId: 'jk' },
  ];
  it('acha o mesmo nome na mesma unidade, mesmo com grafia diferente', () => {
    expect(findDuplicate(base, { fullName: 'maria  jose', unitId: 'paulista' })?.id).toBe('1');
  });
  it('homônimo em outra unidade não conta', () => {
    expect(findDuplicate(base, { fullName: 'Maria José', unitId: 'jk' })).toBeNull();
  });
  it('nome diferente não conta', () => {
    expect(findDuplicate(base, { fullName: 'Maria Joana', unitId: 'paulista' })).toBeNull();
  });
});

describe('cycleFieldsFor', () => {
  const adm = new Date('2026-01-10T12:00:00Z');
  it('colaborador novo mantém o status padrão (aguardando 1ª avaliação)', () => {
    const f = cycleFieldsFor('NOVO', adm);
    expect(f.track).toBe('NOVO');
    expect('status' in f).toBe(false);
  });
  it('colaborador ativo entra efetivado, sem fila de experiência', () => {
    const f = cycleFieldsFor('ATIVO', adm);
    expect(f.track).toBe('ATIVO');
    expect(f.status).toBe('HIRED');
  });
  it('aprendiz continua efetivado', () => {
    expect(cycleFieldsFor('NOVO', adm, true).status).toBe('HIRED');
  });
});
