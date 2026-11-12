import { describe, it, expect } from 'vitest';
import {
  buildReportRow, EMPTY_FILTERS, filtersFromParams, filtersToParams, matchesFilters, periodText, sortRows, summarize,
  type ReportEmployeeInput, type ReportEvaluationInput,
} from '../src/lib/experienceReport';
import { computeDueDates, deliveredOnTime } from '../src/lib/probation';

const HOJE = new Date('2026-09-29T15:00:00.000Z');
const at = (s: string) => `${s}T12:00:00.000Z`;

function funcionario(over: Partial<ReportEmployeeInput> = {}): ReportEmployeeInput {
  const admissionDate = over.admissionDate ?? at('2026-07-16');
  const { period1DueDate, period2DueDate } = computeDueDates(new Date(admissionDate));
  return {
    id: 'e1', fullName: 'Luca Vilhena Pires', roleDescription: 'GARÇOM', shift: 'DIA',
    admissionDate, period1DueDate: period1DueDate.toISOString(), period2DueDate: period2DueDate.toISOString(),
    status: 'AWAITING_PERIOD_1', isApprentice: false, terminationReason: null, terminationDate: null,
    sector: { id: 's-salao', name: 'Salão' }, unit: { id: 'u-jk', name: 'Praça JK' }, evaluations: [],
    ...over,
  };
}

function avaliacao(over: Partial<ReportEvaluationInput> = {}): ReportEvaluationInput {
  return {
    id: 'a1', period: 'FIRST', cycleNumber: 1, conclusion: 'EXTENDER', classification: 'ALGUMAS_POSSIBILIDADES',
    evaluationDate: at('2026-08-24'), dueDateAtEvaluation: at('2026-08-29'), source: 'FORMS',
    evaluatorName: 'ANDRÉ PURDIE COSTA', evaluator: null, ...over,
  };
}

describe('entrega no prazo', () => {
  it('no próprio último dia do contrato ainda está no prazo', () => {
    expect(deliveredOnTime(at('2026-08-29'), at('2026-08-29'))).toEqual({ onTime: true, daysLate: 0 });
    expect(deliveredOnTime(at('2026-08-31'), at('2026-08-29'))).toEqual({ onTime: false, daysLate: 2 });
  });
});

describe('linha do quadro', () => {
  it('1º período entregue, 2º pendente até o fim do 2º contrato', () => {
    const r = buildReportRow(funcionario({ status: 'AWAITING_PERIOD_2', evaluations: [avaliacao()] }), HOJE);
    expect(r.period1.state).toBe('NO_PRAZO');
    expect(r.period2.state).toBe('PENDENTE');
    expect(r.period2.days).toBe(14); // 16/07 + 89 = 13/10
    expect(r.openDue).toMatchObject({ period: 2, days: 14 });
    expect(r.lastConclusion).toBe('EXTENDER');
    expect(r.evaluators).toEqual(['ANDRÉ PURDIE COSTA']);
  });

  it('contrato acabou sem avaliação: atrasada, com os dias', () => {
    const r = buildReportRow(funcionario(), HOJE); // 16/07 + 44 = 29/08
    expect(r.period1.state).toBe('ATRASADA');
    expect(r.period1.days).toBe(31);
    expect(periodText(r.period1)).toBe('Atrasada (31d)');
    expect(r.period2.state).toBe('NAO_SE_APLICA');
  });

  it('efetivado no 1º período não tem 2º; aprendiz não tem nenhum', () => {
    const efetivado = buildReportRow(funcionario({ status: 'HIRED', evaluations: [avaliacao({ conclusion: 'EFETIVAR' })] }), HOJE);
    expect(efetivado.period2.state).toBe('NAO_SE_APLICA');
    expect(efetivado.openDue).toBeNull();
    const aprendiz = buildReportRow(funcionario({ status: 'HIRED', isApprentice: true }), HOJE);
    expect(aprendiz.situation).toBe('APRENDIZ');
    expect(aprendiz.period1.state).toBe('NAO_SE_APLICA');
  });

  it('desligado sem avaliação não aparece como atrasado', () => {
    const r = buildReportRow(funcionario({ status: 'TERMINATED', terminationReason: 'PEDIDO_DEMISSAO', terminationDate: at('2026-08-01') }), HOJE);
    expect(r.period1.state).toBe('NAO_SE_APLICA');
    expect(r.situation).toBe('DESLIGADO');
  });

  it('dois gestores: vale a 1ª resposta para o prazo e a última para a conclusão', () => {
    const r = buildReportRow(funcionario({
      status: 'AWAITING_PERIOD_2',
      evaluations: [
        avaliacao({ id: 'a2', cycleNumber: 2, evaluationDate: at('2026-09-02'), conclusion: 'EXTENDER', evaluatorName: 'RAPHAEL SOBREIRA RAMIRES' }),
        avaliacao({ id: 'a1', evaluationDate: at('2026-08-26'), conclusion: 'EFETIVAR' }),
      ],
    }), HOJE);
    expect(r.period1.state).toBe('NO_PRAZO');
    expect(r.period1.evaluations.map((e) => e.id)).toEqual(['a1', 'a2']);
    expect(r.lastConclusion).toBe('EXTENDER');
    expect(matchesFilters(r, { ...EMPTY_FILTERS, multipleEvaluators: true })).toBe(true);
  });
});

describe('filtros', () => {
  const linhas = [
    buildReportRow(funcionario({ id: 'atrasado' }), HOJE),
    buildReportRow(funcionario({
      id: 'noite', fullName: 'Rômulo Rafael', shift: 'NOITE', admissionDate: at('2026-09-20'),
      unit: { id: 'u-pp', name: 'Praça Paulista' },
    }), HOJE),
    buildReportRow(funcionario({
      id: 'fora', status: 'HIRED', admissionDate: at('2025-12-22'),
      evaluations: [avaliacao({ evaluationDate: at('2026-02-10'), dueDateAtEvaluation: at('2026-02-04'), conclusion: 'EFETIVAR', classification: 'EXCELENTE_AQUISICAO' })],
    }), HOJE),
  ];
  const ids = (f: Partial<typeof EMPTY_FILTERS>) => linhas.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, ...f })).map((r) => r.id);

  it('busca ignora acento e maiúscula', () => {
    expect(ids({ q: 'romulo' })).toEqual(['noite']);
  });
  it('loja, turno e ano de admissão', () => {
    expect(ids({ units: ['u-pp'] })).toEqual(['noite']);
    expect(ids({ shifts: ['DIA'] })).toEqual(['atrasado', 'fora']);
    expect(ids({ admissionFrom: '2026-01-01', admissionTo: '2026-12-31' })).toEqual(['atrasado', 'noite']);
  });
  it('prazo em aberto e entrega', () => {
    expect(ids({ deadline: 'ATRASADA' })).toEqual(['atrasado']);
    expect(ids({ deadline: 'SEM_PENDENCIA' })).toEqual(['fora']);
    expect(ids({ delivery: 'FORA_DO_PRAZO' })).toEqual(['fora']);
    expect(ids({ delivery: 'SEM_AVALIACAO', deliveryPeriod: '1' })).toEqual(['atrasado', 'noite']);
  });
  it('conclusão e classificação, inclusive "sem avaliação"', () => {
    expect(ids({ conclusions: ['EFETIVAR'] })).toEqual(['fora']);
    expect(ids({ classifications: ['SEM'] })).toEqual(['atrasado', 'noite']);
  });
  it('vão e voltam pela URL sem perder nada', () => {
    const f = { ...EMPTY_FILTERS, q: 'garçom', units: ['u-jk', 'u-pp'], deadline: 'VENCE_7' as const, multipleEvaluators: true };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
  });
  it('ordena por prazo com quem não tem pendência no fim', () => {
    expect(sortRows(linhas, 'prazo', 'asc').map((r) => r.id)).toEqual(['atrasado', 'noite', 'fora']);
    expect(sortRows(linhas, 'prazo', 'desc').map((r) => r.id)).toEqual(['noite', 'atrasado', 'fora']);
  });
  it('resumo do recorte', () => {
    const s = summarize(linhas);
    expect(s.total).toBe(3);
    expect(s.bySituation.AGUARDANDO_1).toBe(2);
    expect(s.delivered).toBe(1);
    expect(s.deliveredOnTime).toBe(0);
    expect(s.overdue).toBe(1);
    expect(s.hireRate).toBe(1);
    expect(s.byUnit).toEqual([{ name: 'Praça JK', count: 2 }, { name: 'Praça Paulista', count: 1 }]);
  });
});

describe('desfecho e fuso', () => {
  it('efetivado que saiu meses depois conta como efetivado na taxa', () => {
    const efetivadoESaiu = buildReportRow(funcionario({
      id: 'x', admissionDate: at('2026-01-27'), status: 'TERMINATED', terminationReason: 'ACORDO_MUTUO', terminationDate: at('2026-08-14'),
      evaluations: [avaliacao({ period: 'SECOND', conclusion: 'EFETIVAR', evaluationDate: at('2026-04-23'), dueDateAtEvaluation: at('2026-04-26') })],
    }), HOJE);
    const dispensado = buildReportRow(funcionario({
      id: 'y', status: 'TERMINATED', terminationReason: 'DISPENSA_EXPERIENCIA', terminationDate: at('2026-08-20'),
      evaluations: [avaliacao({ conclusion: 'DEMITIR' })],
    }), HOJE);
    expect(efetivadoESaiu.outcome).toBe('EFETIVADO');
    expect(dispensado.outcome).toBe('DESLIGADO_NA_EXPERIENCIA');
    expect(summarize([efetivadoESaiu, dispensado]).hireRate).toBe(0.5);
  });

  it('demitido pela avaliação do portal (sem motivo gravado) entra no filtro de dispensa', () => {
    const r = buildReportRow(funcionario({ status: 'TERMINATED', evaluations: [avaliacao({ conclusion: 'DEMITIR' })] }), HOJE);
    expect(r.terminationReason).toBe('DISPENSA_EXPERIENCIA');
    expect(matchesFilters(r, { ...EMPTY_FILTERS, terminationReasons: ['DISPENSA_EXPERIENCIA'] })).toBe(true);
  });

  it('às 22h de Brasília do último dia do contrato ainda não está atrasada', () => {
    // 16/07 + 44 = 29/08; 22h de 29/08 em Brasília = 01:00Z de 30/08.
    const r = buildReportRow(funcionario(), new Date('2026-08-30T01:00:00.000Z'));
    expect(r.period1.state).toBe('PENDENTE');
    expect(periodText(r.period1)).toBe('Vence hoje');
  });
});
