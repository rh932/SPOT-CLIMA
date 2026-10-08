import { describe, it, expect } from 'vitest';
import { isSalaoSectorName, defaultUsesColorCycle } from '../src/lib/sectors';

describe('isSalaoSectorName', () => {
  it('reconhece o Salão com e sem acento, em qualquer caixa', () => {
    expect(isSalaoSectorName('Salão')).toBe(true);
    expect(isSalaoSectorName('salao')).toBe(true);
    expect(isSalaoSectorName('SALÃO')).toBe(true);
    expect(isSalaoSectorName('  Salão  ')).toBe(true);
  });

  it('reconhece os setores compostos do Salão', () => {
    expect(isSalaoSectorName('Salão - Bar')).toBe(true);
    expect(isSalaoSectorName('Salão - Atendimento')).toBe(true);
    expect(isSalaoSectorName('Salao Paulista')).toBe(true);
    expect(isSalaoSectorName('Salão/Bar')).toBe(true);
  });

  // A regra é "começa com Salão", não "contém salão" nem "parece salão".
  it('não confunde outros setores', () => {
    expect(isSalaoSectorName('Cozinha')).toBe(false);
    expect(isSalaoSectorName('Salgados')).toBe(false);
    expect(isSalaoSectorName('Salaozinho')).toBe(false);
    expect(isSalaoSectorName('Apoio ao Salão')).toBe(false);
    expect(isSalaoSectorName('Delivery')).toBe(false);
  });
});

describe('defaultUsesColorCycle', () => {
  it('liga o ciclo por padrão nos setores do Salão', () => {
    expect(defaultUsesColorCycle('Salão - Bar')).toBe(true);
    expect(defaultUsesColorCycle('Cozinha')).toBe(false);
  });

  it('respeita a escolha explícita de quem cadastrou', () => {
    expect(defaultUsesColorCycle('Salão - Bar', false)).toBe(false);
    expect(defaultUsesColorCycle('Cozinha', true)).toBe(true);
  });
});
