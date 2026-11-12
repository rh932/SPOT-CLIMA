import { describe, it, expect } from 'vitest';
import {
  average, median, standardDeviation, climateIndex, favorabilityBreakdown,
  classifyClimateIndex, participationRate, classifyParticipation,
  percentagePointDelta, trendFromDelta,
} from '../src/lib/calculations';

describe('average', () => {
  it('calcula a média simples', () => {
    expect(average([1, 2, 3, 4, 5])).toBe(3);
  });
  it('retorna 0 para lista vazia', () => {
    expect(average([])).toBe(0);
  });
});

describe('median', () => {
  it('calcula a mediana com número ímpar de elementos', () => {
    expect(median([1, 3, 2])).toBe(2);
  });
  it('calcula a mediana com número par de elementos', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('standardDeviation', () => {
  it('calcula o desvio padrão populacional', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 2);
  });
  it('retorna 0 para valores idênticos', () => {
    expect(standardDeviation([3, 3, 3])).toBe(0);
  });
});

describe('climateIndex', () => {
  it('índice de clima = média/5 x 100 (exemplo do briefing: média 4.1 -> 82%)', () => {
    expect(climateIndex([4, 4, 4, 4, 5, 4, 4, 4, 4, 4])).toBeCloseTo(82, 0);
  });
  it('média 5 (máximo) resulta em índice 100%', () => {
    expect(climateIndex([5, 5, 5])).toBe(100);
  });
  it('média 1 (mínimo) resulta em índice 20%', () => {
    expect(climateIndex([1, 1, 1])).toBe(20);
  });
});

describe('favorabilityBreakdown', () => {
  it('classifica 4-5 como favorável, 3 como neutro, 1-2 como desfavorável', () => {
    const result = favorabilityBreakdown([1, 2, 3, 4, 5]);
    expect(result.unfavorable).toBe(40);
    expect(result.neutral).toBe(20);
    expect(result.favorable).toBe(40);
    expect(result.count).toBe(5);
  });
});

describe('classifyClimateIndex', () => {
  it.each([
    [95, 'Excelente'],
    [85, 'Excelente'],
    [80, 'Bom'],
    [75, 'Bom'],
    [70, 'Atenção'],
    [65, 'Atenção'],
    [60, 'Crítico'],
    [50, 'Crítico'],
    [30, 'Muito crítico'],
  ])('índice %i -> %s', (index, label) => {
    expect(classifyClimateIndex(index).label).toBe(label);
  });
});

describe('participationRate', () => {
  it('exemplo do briefing: 172 de 200 = 86%', () => {
    expect(participationRate(172, 200)).toBe(86);
  });
  it('retorna 0 quando não há população elegível informada', () => {
    expect(participationRate(50, null)).toBe(0);
    expect(participationRate(50, undefined)).toBe(0);
    expect(participationRate(50, 0)).toBe(0);
  });
});

describe('classifyParticipation', () => {
  it.each([
    [95, 'Excelente participação'],
    [90, 'Excelente participação'],
    [85, 'Muito boa'],
    [80, 'Muito boa'],
    [75, 'Boa'],
    [70, 'Boa'],
    [65, 'Moderada'],
    [60, 'Moderada'],
    [40, 'Baixa'],
  ])('taxa %i%% -> %s', (rate, label) => {
    expect(classifyParticipation(rate).label).toBe(label);
  });
});

describe('percentagePointDelta / trendFromDelta', () => {
  it('exemplo do briefing: 2026: 68%% -> 2027: 76%% = +8 p.p.', () => {
    expect(percentagePointDelta(76, 68)).toBe(8);
  });
  it('classifica tendência considerando a margem morta de 1 p.p.', () => {
    expect(trendFromDelta(5)).toBe('up');
    expect(trendFromDelta(-5)).toBe('down');
    expect(trendFromDelta(0.5)).toBe('stable');
    expect(trendFromDelta(-0.5)).toBe('stable');
  });
});
