import { describe, it, expect } from 'vitest';
import { applyAnonymityRule, filterVisibleGroups, isCombinedFilterSafe, DEFAULT_ANONYMITY_THRESHOLD } from '../src/lib/anonymity';

describe('applyAnonymityRule', () => {
  it('exemplo do briefing: setor com 4 respostas -> resultado oculto', () => {
    const result = applyAnonymityRule(4, { index: 70 });
    expect(result.visible).toBe(false);
    expect(result.data).toBeNull();
    expect(result.hiddenReason).toMatch(/anonimato/i);
  });

  it('exemplo do briefing: setor com 5 respostas -> resultado disponível (limite exato)', () => {
    const result = applyAnonymityRule(5, { index: 70 });
    expect(result.visible).toBe(true);
    expect(result.data).toEqual({ index: 70 });
    expect(result.hiddenReason).toBeNull();
  });

  it('exemplo do briefing: setor com 100 respostas -> resultado disponível', () => {
    const result = applyAnonymityRule(100, { index: 82 });
    expect(result.visible).toBe(true);
    expect(result.data).toEqual({ index: 82 });
  });

  it('usa o limite padrão (5) quando nenhum é informado', () => {
    expect(applyAnonymityRule(5, {}).visible).toBe(true);
    expect(applyAnonymityRule(4, {}).visible).toBe(false);
    expect(DEFAULT_ANONYMITY_THRESHOLD).toBe(5);
  });

  it('respeita um limite customizado definido pela pesquisa', () => {
    expect(applyAnonymityRule(8, { x: 1 }, 10).visible).toBe(false);
    expect(applyAnonymityRule(10, { x: 1 }, 10).visible).toBe(true);
  });
});

describe('filterVisibleGroups', () => {
  it('remove grupos abaixo do limite de anonimato', () => {
    const groups = [
      { name: 'Cozinha', responseCount: 12 },
      { name: 'Delivery', responseCount: 3 },
      { name: 'Administração', responseCount: 5 },
    ];
    const visible = filterVisibleGroups(groups);
    expect(visible.map((g) => g.name)).toEqual(['Cozinha', 'Administração']);
  });
});

describe('isCombinedFilterSafe', () => {
  it('impede cruzamento de filtros que resulte em grupo pequeno demais', () => {
    expect(isCombinedFilterSafe(3)).toBe(false);
    expect(isCombinedFilterSafe(5)).toBe(true);
    expect(isCombinedFilterSafe(4, 5)).toBe(false);
  });
});
