import { describe, it, expect } from 'vitest';
import { suppressCrossTab, findCutViolation, type CrossCell } from '../src/lib/disclosure';
import { effectiveThreshold, MIN_ANONYMITY_THRESHOLD, resultsReleased } from '../src/lib/anonymity';

const T = 5;

/**
 * Confere, por força bruta, que nenhum conjunto de pessoas derivável dos
 * números publicados tem entre 1 e T-1 pessoas. Independe da implementação:
 * monta as linhas publicadas (total, setores e unidades visíveis) e testa toda
 * combinação inteira pequena de coeficientes — o bastante para os cenários
 * minúsculos abaixo.
 */
function bruteForceLeak(cells: CrossCell[], visibleSectors: Set<string>, visibleUnits: Set<string>): number | null {
  const rows: number[][] = [];
  rows.push(cells.map(() => 1));
  for (const s of Array.from(visibleSectors)) rows.push(cells.map((c) => (c.sector === s ? 1 : 0)));
  for (const u of Array.from(visibleUnits)) rows.push(cells.map((c) => (c.unit === u ? 1 : 0)));
  const coefs = [-1, 0, 1];
  const total = Math.pow(coefs.length, rows.length);
  for (let i = 0; i < total; i++) {
    let k = i;
    const vec = cells.map(() => 0);
    rows.forEach((row) => {
      const c = coefs[k % coefs.length];
      k = Math.floor(k / coefs.length);
      row.forEach((v, j) => (vec[j] += c * v));
    });
    if (!vec.every((v) => v === 0 || v === 1)) continue;
    const people = cells.reduce((acc, c, j) => acc + vec[j] * c.count, 0);
    if (people > 0 && people < T) return people;
  }
  return null;
}

describe('effectiveThreshold — piso fixo no servidor', () => {
  it('nunca fica abaixo do piso, mesmo que a pesquisa tenha gravado 1, 0 ou negativo', () => {
    for (const v of [1, 0, -3, 4]) expect(effectiveThreshold(v)).toBe(MIN_ANONYMITY_THRESHOLD);
  });
  it('respeita um limite maior pedido pela pesquisa', () => {
    expect(effectiveThreshold(8)).toBe(8);
  });
  it('valor ausente ou inválido usa o padrão', () => {
    expect(effectiveThreshold(null)).toBe(5);
    expect(effectiveThreshold(undefined)).toBe(5);
    expect(effectiveThreshold(2.5)).toBe(5);
    expect(effectiveThreshold(NaN)).toBe(5);
  });
});

describe('resultsReleased — números só depois de encerrar', () => {
  it.each(['DRAFT', 'SCHEDULED', 'OPEN'])('%s não libera', (s) => expect(resultsReleased(s)).toBe(false));
  it.each(['CLOSED', 'ARCHIVED'])('%s libera', (s) => expect(resultsReleased(s)).toBe(true));
});

describe('suppressCrossTab — complemento dentro de uma divisão', () => {
  it('um setor oculto de 1 pessoa obriga a ocultar outro setor (senão sai por subtração do total)', () => {
    const cells: CrossCell[] = [
      { unit: 'U1', sector: 'Salao', count: 12 },
      { unit: 'U1', sector: 'Cozinha', count: 6 },
      { unit: 'U1', sector: 'Delivery', count: 1 },
    ];
    const r = suppressCrossTab(cells, T);
    expect(r.visibleSectors.has('Delivery')).toBe(false);
    // O menor visível (Cozinha) vai junto: oculto passa a ter 7 pessoas.
    expect(r.visibleSectors.has('Cozinha')).toBe(false);
    expect(r.visibleSectors.has('Salao')).toBe(true);
    expect(bruteForceLeak(cells, r.visibleSectors, r.visibleUnits)).toBeNull();
  });

  it('sem nenhum grupo pequeno, tudo continua visível', () => {
    const cells: CrossCell[] = [
      { unit: 'U1', sector: 'Salao', count: 8 },
      { unit: 'U2', sector: 'Salao', count: 7 },
      { unit: 'U1', sector: 'Cozinha', count: 6 },
      { unit: 'U2', sector: 'Cozinha', count: 9 },
    ];
    const r = suppressCrossTab(cells, T);
    expect(Array.from(r.visibleSectors).sort()).toEqual(['Cozinha', 'Salao']);
    expect(Array.from(r.visibleUnits).sort()).toEqual(['U1', 'U2']);
  });

  it('pesquisa inteira abaixo do limite não publica nenhum grupo', () => {
    const r = suppressCrossTab([{ unit: 'U1', sector: 'Salao', count: 4 }], T);
    expect(r.visibleSectors.size).toBe(0);
    expect(r.visibleUnits.size).toBe(0);
  });

  it('respostas antigas sem unidade entram no complemento das unidades', () => {
    const cells: CrossCell[] = [
      { unit: 'U1', sector: 'Salao', count: 10 },
      { unit: null, sector: 'Salao', count: 2 },
    ];
    const r = suppressCrossTab(cells, T);
    // Publicar U1 = 10 com total 12 entregaria as 2 respostas sem unidade.
    expect(r.visibleUnits.has('U1')).toBe(false);
    expect(bruteForceLeak(cells, r.visibleSectors, r.visibleUnits)).toBeNull();
  });
});

describe('suppressCrossTab — cruzamento unidade × setor', () => {
  // U2 tem Salão (3), Cozinha (1) e Delivery (5); Delivery só existe em U2.
  const cells: CrossCell[] = [
    { unit: 'U1', sector: 'Salao', count: 10 },
    { unit: 'U2', sector: 'Salao', count: 3 },
    { unit: 'U2', sector: 'Cozinha', count: 1 },
    { unit: 'U2', sector: 'Delivery', count: 5 },
  ];

  it('o limite grupo a grupo deixaria vazar Salão-U2 + Cozinha-U2 (4 pessoas) por U2 − Delivery', () => {
    const naive = {
      sectors: new Set(['Salao', 'Delivery']),
      units: new Set(['U1', 'U2']),
    };
    expect(bruteForceLeak(cells, naive.sectors, naive.units)).not.toBeNull();
    expect(findCutViolation(cells, naive.sectors, naive.units, T)).not.toBeNull();
  });

  it('a supressão secundária fecha todas as contas possíveis', () => {
    const r = suppressCrossTab(cells, T);
    expect(bruteForceLeak(cells, r.visibleSectors, r.visibleUnits)).toBeNull();
    expect(findCutViolation(cells, r.visibleSectors, r.visibleUnits, T)).toBeNull();
    // Mantém o máximo possível: o Salão (13 pessoas) segue visível.
    expect(r.visibleSectors.has('Salao')).toBe(true);
  });

  it('cenários aleatórios pequenos: nada derivável entre 1 e T-1 pessoas', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let run = 0; run < 400; run++) {
      const units = ['A', 'B', 'C'].slice(0, 1 + Math.floor(rand() * 3));
      const sectors = ['s1', 's2', 's3'].slice(0, 1 + Math.floor(rand() * 3));
      const sample: CrossCell[] = [];
      for (const u of units) for (const s of sectors) {
        if (rand() < 0.3) continue;
        sample.push({ unit: u, sector: s, count: 1 + Math.floor(rand() * 9) });
      }
      const r = suppressCrossTab(sample, T);
      const total = sample.reduce((acc, c) => acc + c.count, 0);
      if (total < T) {
        // Pesquisa abaixo do limite: nem o total é publicado (BELOW_THRESHOLD).
        expect(r.visibleSectors.size + r.visibleUnits.size).toBe(0);
        continue;
      }
      expect(bruteForceLeak(sample, r.visibleSectors, r.visibleUnits)).toBeNull();
    }
  });

  it('grupos forçados a ficar ocultos (ocultos no geral) continuam ocultos', () => {
    const big: CrossCell[] = [
      { unit: 'U1', sector: 'Salao', count: 9 },
      { unit: 'U1', sector: 'Cozinha', count: 9 },
    ];
    const r = suppressCrossTab(big, T, { forceHiddenSectors: ['Cozinha'] });
    expect(r.visibleSectors.has('Cozinha')).toBe(false);
  });
});
