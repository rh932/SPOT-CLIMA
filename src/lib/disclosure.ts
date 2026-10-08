/**
 * Controle de divulgação dos resultados por setor e por unidade.
 *
 * O limite mínimo (src/lib/anonymity.ts) aplicado grupo a grupo não basta. O
 * painel publica o total geral, cada setor visível e cada unidade visível, e
 * qualquer conta feita com esses números também é "publicada":
 *
 * - Complemento: geral − soma dos setores visíveis = o setor oculto. Com um
 *   único setor oculto de 1 pessoa, a média dele sai por subtração.
 * - Cruzamento: setores e unidades são duas divisões das MESMAS pessoas. Se a
 *   unidade U2 tem Salão (3), Cozinha (1) e Delivery (5) e o Delivery só existe
 *   em U2, então U2 − Delivery = Salão-U2 + Cozinha-U2 = 4 pessoas — abaixo do
 *   limite, e nenhum dos dois números foi ocultado.
 *
 * Toda conta desse tipo que dá um conjunto de pessoas é um "corte" no grafo
 * unidade × setor (ver findCutViolation). A regra aqui garante que todo
 * conjunto derivável dos números publicados tenha 0 pessoas ou pelo menos
 * `threshold` pessoas, ocultando grupos visíveis a mais quando preciso
 * (supressão secundária).
 *
 * Módulo puro, sem banco: é exercitado direto em tests/disclosure.test.ts.
 */

/** Pessoas de uma combinação unidade × setor. `unit` nulo = resposta antiga, sem unidade. */
export interface CrossCell {
  unit: string | null;
  sector: string;
  count: number;
}

export interface CrossSuppression {
  visibleSectors: Set<string>;
  visibleUnits: Set<string>;
}

export interface SuppressionOptions {
  /** Setores que já precisam ficar ocultos (ex.: ocultos no resultado geral). */
  forceHiddenSectors?: Iterable<string>;
  forceHiddenUnits?: Iterable<string>;
}

/**
 * Acima disto a verificação de cortes (exponencial no número de unidades)
 * fica cara; nesse caso a divisão por unidade inteira é ocultada — escolha
 * conservadora para uma operação que hoje tem poucas lojas.
 */
const MAX_UNIT_NODES = 12;

const HIDDEN_NODE = '\u0000oculto';

export function suppressCrossTab(
  cells: CrossCell[],
  threshold: number,
  options: SuppressionOptions = {},
): CrossSuppression {
  const sectorCount = new Map<string, number>();
  const unitCount = new Map<string, number>();
  let total = 0;
  for (const c of cells) {
    if (c.count <= 0) continue;
    total += c.count;
    sectorCount.set(c.sector, (sectorCount.get(c.sector) ?? 0) + c.count);
    if (c.unit !== null) unitCount.set(c.unit, (unitCount.get(c.unit) ?? 0) + c.count);
  }

  if (total < threshold) return { visibleSectors: new Set(), visibleUnits: new Set() };

  const forcedS = new Set(options.forceHiddenSectors ?? []);
  const forcedU = new Set(options.forceHiddenUnits ?? []);
  const visibleSectors = new Set(
    Array.from(sectorCount.entries()).filter(([s, n]) => n >= threshold && !forcedS.has(s)).map(([s]) => s),
  );
  const visibleUnits = new Set(
    Array.from(unitCount.entries()).filter(([u, n]) => n >= threshold && !forcedU.has(u)).map(([u]) => u),
  );

  const smallest = (visible: Set<string>, counts: Map<string, number>, among?: Iterable<string>): string | null => {
    let best: string | null = null;
    for (const key of among ?? visible) {
      if (!visible.has(key)) continue;
      if (best === null || (counts.get(key) ?? 0) < (counts.get(best) ?? 0)) best = key;
    }
    return best;
  };
  const sumOf = (visible: Set<string>, counts: Map<string, number>) =>
    Array.from(visible).reduce((acc, k) => acc + (counts.get(k) ?? 0), 0);

  // Cada volta oculta um grupo a mais, então o laço termina: no pior caso
  // tudo fica oculto e só o total (que já passou do limite) é publicado.
  for (;;) {
    // 1. Complemento dentro de cada divisão.
    const hiddenS = total - sumOf(visibleSectors, sectorCount);
    if (hiddenS > 0 && hiddenS < threshold && visibleSectors.size > 0) {
      visibleSectors.delete(smallest(visibleSectors, sectorCount)!);
      continue;
    }
    const hiddenU = total - sumOf(visibleUnits, unitCount);
    if (hiddenU > 0 && hiddenU < threshold && visibleUnits.size > 0) {
      visibleUnits.delete(smallest(visibleUnits, unitCount)!);
      continue;
    }

    // 2. Cruzamento entre as duas divisões.
    if (visibleUnits.size + 1 > MAX_UNIT_NODES) {
      visibleUnits.clear();
      continue;
    }
    const violation = findCutViolation(cells, visibleSectors, visibleUnits, threshold);
    if (!violation) break;

    // Oculta o menor grupo visível que participa da conta. Se a conta só usa
    // grupos já ocultos, oculta o menor grupo visível de todos: isso muda a
    // composição dos ocultos e desfaz aquele corte.
    let u = smallest(visibleUnits, unitCount, violation.units);
    let s = smallest(visibleSectors, sectorCount, violation.sectors);
    if (u === null && s === null) {
      u = smallest(visibleUnits, unitCount);
      s = smallest(visibleSectors, sectorCount);
    }
    if (u === null && s === null) break; // inalcançável: com tudo oculto não sobra corte pequeno
    const nu = u === null ? Infinity : unitCount.get(u)!;
    const ns = s === null ? Infinity : sectorCount.get(s)!;
    if (nu <= ns) visibleUnits.delete(u!);
    else visibleSectors.delete(s!);
  }

  return { visibleSectors, visibleUnits };
}

/**
 * Procura um conjunto de pessoas derivável dos números publicados (total,
 * setores visíveis, unidades visíveis) com 0 < pessoas < threshold.
 *
 * Os grupos ocultos de cada divisão viram um nó só ("demais"), cujo total
 * também é derivável por subtração. Num grafo bipartido unidade × setor com
 * todos os totais conhecidos, todo conjunto de células derivável é união de
 * cortes "de um sentido só": um conjunto A de unidades e um conjunto B de
 * setores cujas células caem TODAS dentro de A. A conta
 * Σ unidades(A) − Σ setores(B) dá exatamente as pessoas de A fora de B.
 * Basta, então, conferir todo A e todo B possível — o que é uma soma de
 * subconjuntos sobre os setores "exclusivos" de A.
 */
export function findCutViolation(
  cells: CrossCell[],
  visibleSectors: Set<string>,
  visibleUnits: Set<string>,
  threshold: number,
): { units: string[]; sectors: string[] } | null {
  const unitNode = (u: string | null) => (u !== null && visibleUnits.has(u) ? u : HIDDEN_NODE);
  const sectorNode = (s: string) => (visibleSectors.has(s) ? s : HIDDEN_NODE);

  const edges = new Map<string, Map<string, number>>(); // setor → unidade → pessoas
  const unitTotals = new Map<string, number>();
  for (const c of cells) {
    if (c.count <= 0) continue;
    const u = unitNode(c.unit);
    const s = sectorNode(c.sector);
    const row = edges.get(s) ?? new Map<string, number>();
    row.set(u, (row.get(u) ?? 0) + c.count);
    edges.set(s, row);
    unitTotals.set(u, (unitTotals.get(u) ?? 0) + c.count);
  }

  const units = Array.from(unitTotals.keys());
  const unitIndex = new Map(units.map((u, i) => [u, i]));
  const sectors = Array.from(edges.entries()).map(([s, row]) => {
    let mask = 0;
    let count = 0;
    for (const [u, n] of row) {
      mask |= 1 << unitIndex.get(u)!;
      count += n;
    }
    return { key: s, mask, count };
  });

  const full = (1 << units.length) - 1;
  for (let a = 1; a <= full; a++) {
    let t = 0;
    for (let i = 0; i < units.length; i++) if (a & (1 << i)) t += unitTotals.get(units[i])!;
    const exclusive = sectors.filter((s) => (s.mask & ~a) === 0);

    // reach[σ] = índice do último setor usado para chegar à soma σ (-1 = vazio).
    const reach = new Int32Array(t + 1).fill(-2);
    reach[0] = -1;
    exclusive.forEach((s, idx) => {
      for (let sum = t - s.count; sum >= 0; sum--) {
        if (reach[sum] !== -2 && reach[sum + s.count] === -2) reach[sum + s.count] = idx;
      }
    });
    for (let sigma = Math.max(0, t - threshold + 1); sigma < t; sigma++) {
      if (reach[sigma] === -2) continue;
      const usedSectors: string[] = [];
      for (let rest = sigma; rest > 0; ) {
        const s = exclusive[reach[rest]];
        usedSectors.push(s.key);
        rest -= s.count;
      }
      const usedUnits = units.filter((_, i) => a & (1 << i));
      return {
        units: usedUnits.filter((u) => u !== HIDDEN_NODE),
        sectors: usedSectors.filter((s) => s !== HIDDEN_NODE),
      };
    }
  }
  return null;
}
