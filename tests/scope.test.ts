import { describe, it, expect } from 'vitest';
import { isInScope, hasCompleteScope, canEvaluate } from '../src/lib/scope';

const SALAO = 'sector-salao';
const COZINHA = 'sector-cozinha';
const ADM = 'sector-adm';
const PAULISTA = 'unit-paulista';
const JK = 'unit-jk';
const OUTRA = 'unit-outra';

// Gestor Líder cobrindo dois setores em duas unidades, nos DOIS turnos.
const LIDER = { scopedUnitIds: [PAULISTA, JK], scopedSectorIds: [SALAO, COZINHA], scopedShifts: ['DIA', 'NOITE'] };

const employee = (unitId: string, sectorId: string, shift = 'DIA') => ({ unitId, sectorId, shift });

describe('isInScope', () => {
  it('aceita funcionário em qualquer combinação de unidade e setor do escopo', () => {
    expect(isInScope(LIDER, employee(PAULISTA, SALAO))).toBe(true);
    expect(isInScope(LIDER, employee(PAULISTA, COZINHA))).toBe(true);
    expect(isInScope(LIDER, employee(JK, SALAO))).toBe(true);
    expect(isInScope(LIDER, employee(JK, COZINHA))).toBe(true);
  });

  it('Gestor Líder com os dois turnos alcança diurno e noturno', () => {
    expect(isInScope(LIDER, employee(PAULISTA, SALAO, 'DIA'))).toBe(true);
    expect(isInScope(LIDER, employee(PAULISTA, SALAO, 'NOITE'))).toBe(true);
  });

  it('recusa setor fora do escopo, mesmo em unidade do escopo', () => {
    expect(isInScope(LIDER, employee(PAULISTA, ADM))).toBe(false);
  });

  it('recusa unidade fora do escopo, mesmo em setor do escopo', () => {
    expect(isInScope(LIDER, employee(OUTRA, SALAO))).toBe(false);
  });

  it('gestor de um turno só não enxerga o outro turno', () => {
    const diurno = { scopedUnitIds: [PAULISTA], scopedSectorIds: [SALAO], scopedShifts: ['DIA'] };
    expect(isInScope(diurno, employee(PAULISTA, SALAO, 'DIA'))).toBe(true);
    expect(isInScope(diurno, employee(PAULISTA, SALAO, 'NOITE'))).toBe(false);
  });

  it('recusa tudo quando o escopo está vazio', () => {
    const semEscopo = { scopedUnitIds: [], scopedSectorIds: [], scopedShifts: [] };
    expect(isInScope(semEscopo, employee(PAULISTA, SALAO))).toBe(false);
  });

  it('gestor comum com um setor só não alcança os outros', () => {
    const gestor = { scopedUnitIds: [PAULISTA], scopedSectorIds: [ADM], scopedShifts: ['DIA'] };
    expect(isInScope(gestor, employee(PAULISTA, ADM))).toBe(true);
    expect(isInScope(gestor, employee(PAULISTA, SALAO))).toBe(false);
  });
});

describe('hasCompleteScope', () => {
  it('exige ao menos uma unidade, um setor e um turno', () => {
    expect(hasCompleteScope(LIDER)).toBe(true);
    expect(hasCompleteScope({ ...LIDER, scopedUnitIds: [] })).toBe(false);
    expect(hasCompleteScope({ ...LIDER, scopedSectorIds: [] })).toBe(false);
    expect(hasCompleteScope({ ...LIDER, scopedShifts: [] })).toBe(false);
  });
});

describe('canEvaluate', () => {
  it('o GESTOR avalia', () => {
    expect(canEvaluate('GESTOR')).toBe(true);
  });

  it('Gestor Líder (PJ de um único setor) avalia a própria equipe', () => {
    expect(canEvaluate('GESTOR_LIDER')).toBe(true);
  });

  it('papéis administrativos não avaliam pelo portal do gestor', () => {
    expect(canEvaluate('SUPER_ADMIN')).toBe(false);
    expect(canEvaluate('RH')).toBe(false);
  });
});

describe('SUPER_ADMIN no portal da operação', () => {
  // requireGestor() preenche o escopo dele com TODAS as unidades e setores,
  // então a regra de escopo continua valendo sem caso especial.
  const SUPER = { scopedUnitIds: [PAULISTA, JK, OUTRA], scopedSectorIds: [SALAO, COZINHA, ADM], scopedShifts: ['DIA', 'NOITE'] };

  it('enxerga colaborador de qualquer unidade, setor e turno', () => {
    expect(hasCompleteScope(SUPER)).toBe(true);
    expect(isInScope(SUPER, { unitId: JK, sectorId: ADM, shift: 'NOITE' })).toBe(true);
    expect(isInScope(SUPER, { unitId: PAULISTA, sectorId: SALAO, shift: 'DIA' })).toBe(true);
  });

  // O Super Admin entra no portal para acompanhar, mas não preenche avaliação
  // (o Líder passou a avaliar em 23/11/2026; o Super Admin continua de fora).
  it('não avalia pelo portal', () => {
    expect(canEvaluate('SUPER_ADMIN')).toBe(false);
    expect(canEvaluate('GESTOR_LIDER')).toBe(true);
    expect(canEvaluate('GESTOR')).toBe(true);
  });
});
