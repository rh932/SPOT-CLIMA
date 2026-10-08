import { describe, it, expect } from 'vitest';
import { computeDueDates, daysUntilDueDay, dueBadge, nextStatusAfterConclusion, saoPauloIsoDate } from '../src/lib/probation';

describe('computeDueDates', () => {
  it('vence no último dia de cada contrato de 45 dias (admissão conta como 1º dia)', () => {
    const admission = new Date('2026-01-01T00:00:00.000Z');
    const { period1DueDate, period2DueDate } = computeDueDates(admission);
    // 01/01 + 44 = 14/02 (45º dia); 01/01 + 89 = 31/03 (90º dia).
    expect(period1DueDate.toISOString()).toBe('2026-02-14T00:00:00.000Z');
    expect(period2DueDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('mantém o dia quando a admissão vem com hora (a correção pelo painel grava T12:00)', () => {
    const { period1DueDate, period2DueDate } = computeDueDates(new Date('2026-09-29T12:00:00.000Z'));
    expect(period1DueDate.toISOString().slice(0, 10)).toBe('2026-11-12');
    expect(period2DueDate.toISOString().slice(0, 10)).toBe('2026-12-27');
  });
});

describe('nextStatusAfterConclusion', () => {
  it.each([['FIRST'], ['SECOND']] as const)('DEMITIR (%s) -> TERMINATED', (period) => {
    expect(nextStatusAfterConclusion('DEMITIR', period)).toBe('TERMINATED');
  });

  it.each([['FIRST'], ['SECOND']] as const)('EFETIVAR (%s) -> HIRED', (period) => {
    expect(nextStatusAfterConclusion('EFETIVAR', period)).toBe('HIRED');
  });

  it('EXTENDER no 1º ciclo -> AWAITING_PERIOD_2', () => {
    expect(nextStatusAfterConclusion('EXTENDER', 'FIRST')).toBe('AWAITING_PERIOD_2');
  });

  it('EXTENDER no 2º ciclo lança erro (não existe 3º ciclo)', () => {
    expect(() => nextStatusAfterConclusion('EXTENDER', 'SECOND')).toThrow();
  });
});

describe('prazo por dia de calendário (São Paulo)', () => {
  // Fim do 1º contrato em 15/10, gravado às 15:00Z (cadastro pelo painel).
  const fim = new Date('2026-10-15T15:00:00.000Z');

  it('no último dia, de manhã, "Vence hoje" — e não "1d"', () => {
    expect(dueBadge(fim, new Date('2026-10-15T12:00:00.000Z'))?.label).toBe('Vence hoje');
  });
  it('às 22h de Brasília do último dia ainda não está atrasado', () => {
    expect(dueBadge(fim, new Date('2026-10-16T01:00:00.000Z'))?.label).toBe('Vence hoje');
    expect(saoPauloIsoDate(new Date('2026-10-16T01:00:00.000Z'))).toBe('2026-10-15');
  });
  it('no dia seguinte já está atrasado', () => {
    expect(dueBadge(fim, new Date('2026-10-16T12:00:00.000Z'))?.label).toBe('Atrasado (1d)');
    expect(daysUntilDueDay(fim, new Date('2026-10-16T12:00:00.000Z'))).toBe(-1);
  });
  it('prazo gravado à meia-noite UTC conta o mesmo dia', () => {
    expect(daysUntilDueDay('2026-10-15T00:00:00.000Z', new Date('2026-10-15T20:00:00.000Z'))).toBe(0);
  });
});
