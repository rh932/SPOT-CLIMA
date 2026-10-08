import { describe, it, expect } from 'vitest';
import { buildReportRow, type ReportEmployeeInput } from '@/lib/experienceReport';
import { computeIndicators, daysUntil, lastMonths } from '@/lib/indicators';

const NOW = new Date('2026-10-08T15:00:00Z');

function emp(over: Partial<ReportEmployeeInput> & { id: string; admissionDate: string }): ReportEmployeeInput {
  const adm = new Date(over.admissionDate);
  const plus = (d: number) => new Date(adm.getTime() + d * 86400000).toISOString();
  return {
    fullName: over.id,
    roleDescription: 'Garçom',
    shift: 'DIA',
    period1DueDate: plus(44),
    period2DueDate: plus(89),
    status: 'AWAITING_PERIOD_1',
    sector: { id: 's1', name: 'Salão' },
    unit: { id: 'u1', name: 'JK' },
    evaluations: [],
    ...over,
  };
}

describe('meses', () => {
  it('últimos 12 meses até o atual, do mais antigo ao mais novo', () => {
    const m = lastMonths(new Date('2026-10-08T00:00:00Z'), 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2025-11');
    expect(m[11]).toBe('2026-10');
  });

  it('dias até o prazo', () => {
    const hoje = Date.UTC(2026, 9, 8);
    expect(daysUntil('2026-10-10T00:00:00Z', hoje)).toBe(2);
    expect(daysUntil('2026-10-01T00:00:00Z', hoje)).toBe(-7);
  });
});

describe('indicadores da experiência', () => {
  const employees: ReportEmployeeInput[] = [
    // Efetivado no 1º período, avaliado no prazo.
    emp({
      id: 'a', admissionDate: '2026-06-02T00:00:00Z', status: 'HIRED',
      evaluations: [{ id: 'e1', period: 'FIRST', cycleNumber: 1, conclusion: 'EFETIVAR', classification: 'OTIMAS_PERSPECTIVAS', evaluationDate: '2026-07-10T00:00:00Z', dueDateAtEvaluation: '2026-07-16T00:00:00Z' }],
    }),
    // Desligado na experiência, avaliado 3 dias atrasado.
    emp({
      id: 'b', admissionDate: '2026-06-10T00:00:00Z', status: 'TERMINATED', terminationReason: 'DISPENSA_EXPERIENCIA', terminationDate: '2026-07-30T00:00:00Z',
      evaluations: [{ id: 'e2', period: 'FIRST', cycleNumber: 1, conclusion: 'DEMITIR', classification: 'FRACO', evaluationDate: '2026-07-27T00:00:00Z', dueDateAtEvaluation: '2026-07-24T00:00:00Z' }],
    }),
    // Em curso, prazo do 1º período já passou (atrasada agora).
    emp({ id: 'c', admissionDate: '2026-08-01T00:00:00Z' }),
    // Aprendiz não entra nas taxas.
    emp({ id: 'd', admissionDate: '2026-08-05T00:00:00Z', isApprentice: true }),
    // Outra loja/turno.
    emp({ id: 'e', admissionDate: '2026-09-20T00:00:00Z', shift: 'NOITE', unit: { id: 'u2', name: 'Paulista' } }),
  ];
  const rows = employees.map((e) => buildReportRow(e, NOW));
  const openDues = employees.flatMap((e, i) => {
    const r = rows[i];
    return r.openDue ? [{ unitId: e.unit!.id, sectorId: e.sector!.id, shift: e.shift, days: r.openDue.days }] : [];
  });

  const result = computeIndicators({
    rows,
    evaluations: [
      { evaluatorAdminId: 'g1', period: 'FIRST', evaluationDate: '2026-07-10T00:00:00Z', dueDateAtEvaluation: '2026-07-16T00:00:00Z' },
      { evaluatorAdminId: 'g1', period: 'FIRST', evaluationDate: '2026-07-27T00:00:00Z', dueDateAtEvaluation: '2026-07-24T00:00:00Z' },
      { evaluatorAdminId: 'g2', period: 'FEEDBACK', evaluationDate: '2026-09-01T00:00:00Z', dueDateAtEvaluation: '2026-09-01T00:00:00Z' },
      // Fora da janela de 12 meses: não conta.
      { evaluatorAdminId: 'g2', period: 'FIRST', evaluationDate: '2024-01-01T00:00:00Z', dueDateAtEvaluation: '2023-12-01T00:00:00Z' },
    ],
    managers: [
      { id: 'g1', name: 'Ana', role: 'GESTOR', scope: { scopedUnitIds: ['u1'], scopedSectorIds: ['s1'], scopedShifts: ['DIA'] } },
      { id: 'g2', name: 'Bruno', role: 'GESTOR', scope: { scopedUnitIds: ['u2'], scopedSectorIds: ['s1'], scopedShifts: ['NOITE'] } },
    ],
    openDues,
    now: NOW,
  });

  it('mês a mês pela admissão, sem aprendiz', () => {
    const jun = result.months.find((m) => m.month === '2026-06')!;
    expect(jun).toMatchObject({ admitted: 2, hired: 1, dismissed: 1, ongoing: 0, hireRate: 0.5 });
    const ago = result.months.find((m) => m.month === '2026-08')!;
    expect(ago).toMatchObject({ admitted: 1, ongoing: 1, hireRate: null });
  });

  it('totais', () => {
    expect(result.totals.admitted).toBe(4);
    expect(result.totals.hireRate).toBe(0.5);
    expect(result.totals.onTimeRate).toBe(0.5);
    expect(result.totals.overdueNow).toBe(1);
  });

  it('gestor: pontualidade das próprias avaliações e atrasos no escopo, quem tem atraso primeiro', () => {
    expect(result.managers.map((m) => m.name)).toEqual(['Ana', 'Bruno']);
    const ana = result.managers[0];
    expect(ana).toMatchObject({ evaluations: 2, onTime: 1, onTimeRate: 0.5, avgDaysLate: 3, overdueNow: 1, dueSoon: 0 });
    const bruno = result.managers[1];
    expect(bruno).toMatchObject({ evaluations: 1, onTimeRate: 1, overdueNow: 0 });
    // A do Bruno (e) vence em 7 dias ou menos? Admissão 20/09 → 1º prazo 03/11: não.
    expect(bruno.dueSoon).toBe(0);
  });

  it('por loja', () => {
    const jk = result.byUnit.find((g) => g.name === 'JK')!;
    expect(jk).toMatchObject({ total: 3, hireRate: 0.5, delivered: 2, onTimeRate: 0.5, overdueNow: 1 });
  });
});
