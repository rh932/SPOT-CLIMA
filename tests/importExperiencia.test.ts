import { describe, it, expect } from 'vitest';
import {
  emailFromName, evaluatorExit, mergeWithExisting, normName, parseCsv, parseFormsRow, parseFormsTimestamp, planEmployee,
  planEvaluators, resolveEvaluationDate, sectorTagFrom, shiftFromHours, unitTagFrom, type ExistingEmployee, type SheetAdmission,
} from '../src/lib/importExperiencia';
import { classifyTerminationText, statusFromEvaluations } from '../src/lib/termination';

const at = (s: string) => new Date(`${s}T12:00:00.000Z`);

/** Uma linha do CSV do Forms na ordem das colunas do formulário. */
function linha(over: Partial<Record<number, string>> = {}): string[] {
  const base = [
    '2026/02/24 9:03:31 AM GMT-3', '2026-02-24', 'PAULISTA', '', 'RENE ITALO ALMEIDA SANTOS (SALÃO PP)',
    'ERIC ZULQUES CARIOBA', '2026-01-23', 'SALÃO\tGARÇOM\tNOITE', 'Praça Paulista', '1º contrato de experiência',
    '2026-03-08', 'Bom', 'Sim', 'Sim', 'Sim', 'Não', 'Ótimo', 'Sim', 'Sim', 'Não', 'Regular', 'Sim', 'Não',
    'Ruim', 'Regular', 'Não', 'Educado', 'Atrasos', 'Tem algumas possibilidades.', '+ 45 dias em caráter experimental.',
  ];
  return base.map((v, i) => over[i] ?? v);
}

function admissao(over: Partial<SheetAdmission> = {}): SheetAdmission {
  return {
    row: 406, name: 'ERIC ZULQUES CARIOBA', unit: 'PP', sector: 'SALAO', role: 'GARÇOM', hours: '17h00 às 00h30',
    shift: null, admission: at('2026-01-23'), eval1: null, eval2: null, conclusion: null, ...over,
  };
}

describe('texto', () => {
  it('normaliza nome sem acento, quebra de linha nem espaço duplo', () => {
    expect(normName('  Kaio de Sousa  Nascimento\n')).toBe('KAIO DE SOUSA NASCIMENTO');
    expect(normName('JOÃO CONN MUNIZ')).toBe(normName('Joao Conn Muniz'));
  });

  it('e-mail do gestor: 1º e 2º nome, sem "de/da/el"', () => {
    expect(emailFromName('JOÃO GUILHERME FERNANDES FIGUEIREDO MOURA (SALÃO JK)')).toBe('joao.guilherme@spot.com');
    expect(emailFromName('DIEGO DE LUCENA CHAVES (COZINHA JK)')).toBe('diego.lucena@spot.com');
    expect(emailFromName('HAMZA EL HENNAWI (SALÃO JK)')).toBe('hamza.hennawi@spot.com');
    expect(emailFromName('ANDRÉ PURDIE COSTA')).toBe('andre.purdie@spot.com');
  });

  it('loja e setor pelos rótulos da planilha e do Forms', () => {
    expect(unitTagFrom('PP')).toBe('PP');
    expect(unitTagFrom('Praça Paulista')).toBe('PP');
    expect(unitTagFrom('SALÃO JK')).toBe('JK');
    expect(sectorTagFrom('SALÃO')).toBe('SALAO');
    expect(sectorTagFrom('COZ')).toBe('COZINHA');
    expect(sectorTagFrom('ADM - JK')).toBe('ADM');
    expect(sectorTagFrom('DELIVERY')).toBe('DELIVERY');
  });

  it('turno pelo horário de entrada', () => {
    expect(shiftFromHours('17h30 às 00h30')).toBe('NOITE');
    expect(shiftFromHours('16h30 às 00h25')).toBe('NOITE');
    expect(shiftFromHours('08h10 às 16h30')).toBe('DIA');
    expect(shiftFromHours('INTERMEDIÁRIO')).toBeNull();
  });
});

describe('CSV do Forms', () => {
  it('lê aspas, vírgula e quebra de linha dentro do campo', () => {
    const rows = parseCsv('﻿"a","b, c"\n"linha\nquebrada","x ""y"""\n');
    expect(rows).toEqual([['a', 'b, c'], ['linha\nquebrada', 'x "y"']]);
  });

  it('carimbo GMT-3 vira UTC', () => {
    expect(parseFormsTimestamp('2026/02/04 3:04:53 PM GMT-3').toISOString()).toBe('2026-02-04T18:04:53.000Z');
    expect(parseFormsTimestamp('2026/03/03 12:07:00 AM GMT-3').toISOString()).toBe('2026-03-03T03:07:00.000Z');
  });

  it('converte as respostas para os valores do sistema', () => {
    const r = parseFormsRow(linha());
    expect(r.period).toBe('FIRST');
    expect(r.shiftHint).toBe('NOITE');
    expect(r.evaluatorLabel).toBe('RENE ITALO ALMEIDA SANTOS (SALÃO PP)');
    expect(r.flexibilityRating).toBe('BOM');
    expect(r.flexibilitySubAnswers).toEqual({ q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'NAO' });
    expect(r.interestSubAnswers).toEqual({ q1: 'SIM', q2: 'SIM', q3: 'NAO' });
    expect(r.relationshipRating).toBe('REGULAR');
    expect(r.learningRating).toBe('RUIM');
    expect(r.learningSubAnswers).toEqual({ q1: 'REGULAR', q2: 'NAO' });
    expect(r.classification).toBe('ALGUMAS_POSSIBILIDADES');
    expect(r.conclusion).toBe('EXTENDER');
    expect(r.externalId).toBe('forms:2026-02-24T12:03:31.000Z|ERIC ZULQUES CARIOBA');
  });

  it('recusa valor que o formulário não tem, em vez de gravar errado', () => {
    expect(() => parseFormsRow(linha({ 11: 'Excelente' }))).toThrow(/Nota desconhecida/);
  });

  it('data de preenchimento impossível cai para o dia do envio (horário de Brasília)', () => {
    const r = parseFormsRow(linha({ 0: '2026/05/06 10:15:00 PM GMT-3', 1: '2016-05-06' }));
    const { date, corrigida } = resolveEvaluationDate(r, at('2026-02-11'));
    expect(corrigida).toBe(true);
    expect(date.toISOString().slice(0, 10)).toBe('2026-05-06');
  });
});

describe('plano do funcionário', () => {
  it('prazo pelo último dia do contrato e turno pelo Forms', () => {
    const p = planEmployee(admissao(), [parseFormsRow(linha())], []);
    expect(p.period1DueDate.toISOString().slice(0, 10)).toBe('2026-03-08');
    expect(p.period2DueDate.toISOString().slice(0, 10)).toBe('2026-04-22');
    expect(p.shift).toBe('NOITE');
    expect(p.status).toBe('AWAITING_PERIOD_2');
  });

  it('dois gestores no mesmo período: as duas respostas entram, 1ª e 2ª', () => {
    const a = parseFormsRow(linha({ 0: '2026/02/26 4:00:43 PM GMT-3', 29: 'Efetivar.' }));
    const b = parseFormsRow(linha({ 0: '2026/03/03 7:31:19 PM GMT-3', 3: 'RAPHAEL SOBREIRA RAMIRES (SALÃO JK)', 4: '' }));
    const p = planEmployee(admissao(), [b, a], []);
    expect(p.evaluations.map((e) => [e.period, e.cycleNumber])).toEqual([['FIRST', 1], ['FIRST', 2]]);
    // Vale a mais recente: +45.
    expect(p.status).toBe('AWAITING_PERIOD_2');
  });

  it('a aba de demissões desliga, com motivo e data', () => {
    const p = planEmployee(admissao(), [], [
      { row: 1, name: 'Eric Zulques Carioba', unit: 'PP', reasonText: 'DEMISSÃO NO CONTRATO DE EXPERIÊNCIA', date: at('2026-04-20') },
    ]);
    expect(p.status).toBe('TERMINATED');
    expect(p.termination).toMatchObject({ reason: 'DISPENSA_EXPERIENCIA', notes: 'DEMISSÃO NO CONTRATO DE EXPERIÊNCIA' });
  });

  it('saída de um vínculo anterior da mesma pessoa não desliga a admissão nova', () => {
    const p = planEmployee(admissao(), [], [
      { row: 1, name: 'ERIC ZULQUES CARIOBA', unit: 'PP', reasonText: 'Pedido de demissão', date: at('2024-05-01') },
    ]);
    expect(p.status).toBe('AWAITING_PERIOD_1');
  });

  it('abandono anotado só no quadro de admissões desliga sem data', () => {
    const p = planEmployee(admissao({ eval1: 'ABANDONO DE EMPREGO', eval2: 'ABANDONO DE EMPREGO' }), [], []);
    expect(p.status).toBe('TERMINATED');
    expect(p.termination?.reason).toBe('ABANDONO_EMPREGO');
    expect(p.termination?.date).toBeNull();
  });

  it('aprendiz fica em contrato, sem ciclo de experiência', () => {
    const p = planEmployee(admissao({ role: 'APRENDIZ DE COZINHA' }), [], []);
    expect(p.isApprentice).toBe(true);
    expect(p.status).toBe('HIRED');
  });

  it('"+45" no 2º período é tratado como efetivação', () => {
    const r2 = parseFormsRow(linha({ 0: '2026/04/20 9:00:00 AM GMT-3', 1: '2026-04-20', 9: '2º contrato de experiência' }));
    const p = planEmployee(admissao(), [r2], []);
    expect(p.status).toBe('HIRED');
    expect(p.avisos.join(' ')).toMatch(/\+45 dias/);
  });
});

describe('saída que encerra cada vínculo', () => {
  const saidas = [
    { row: 1, name: 'DIEGO MANCINELLI', unit: 'JK' as const, reasonText: 'Término de contrato de aprendizagem', date: at('2026-07-26') },
    { row: 2, name: 'DIEGO MANCINELLI', unit: 'JK' as const, reasonText: 'Transferência de loja', date: at('2026-08-10') },
  ];

  it('aprendiz que termina num dia e é contratado dois dias depois: a saída é do vínculo antigo', () => {
    const novo = planEmployee(admissao({ name: 'DIEGO MANCINELLI', role: 'AUXILIAR DE DEPARTAMENTO PESSOAL', admission: at('2026-07-28') }), [], saidas);
    expect(novo.status).toBe('AWAITING_PERIOD_1');
    const antigo = planEmployee(
      admissao({ name: 'DIEGO MANCINELLI', role: 'APRENDIZ DE ALMOXARIFADO', admission: at('2025-01-10') }), [], saidas, at('2026-07-28'),
    );
    expect(antigo.termination?.reason).toBe('FIM_APRENDIZAGEM');
  });

  it('saída no dia anterior à admissão nunca cai nela, mesmo com um dia de intervalo', () => {
    const p = planEmployee(admissao({ name: 'DIEGO MANCINELLI', admission: at('2026-07-27') }), [], saidas);
    expect(p.status).toBe('AWAITING_PERIOD_1');
  });

  it('transferência entre lojas não desliga: vira aviso', () => {
    const p = planEmployee(admissao({ name: 'DIEGO MANCINELLI', admission: at('2026-07-28') }), [], [saidas[1]]);
    expect(p.status).toBe('AWAITING_PERIOD_1');
    expect(p.avisos.join(' ')).toMatch(/transferência não é desligamento/);
  });
});

describe('gestor do Forms que já saiu', () => {
  const adm = [
    { name: 'HAMZA EL HENNAWI', admission: at('2022-07-13') },
    { name: 'CRISTIANO COSTA SILVA', admission: at('2022-06-24') },
  ];
  const dem = [
    { row: 454, name: 'HAMZA EL HENNAWI', unit: 'JK' as const, reasonText: 'Acordo Mutuo - Aviso Prévio Trabalhado', date: at('2026-08-13') },
    { row: 10, name: 'CRISTIANO COSTA SILVA', unit: 'PP' as const, reasonText: 'Acordo mútuo', date: at('2022-06-23') },
    { row: 11, name: 'CRISTIANO COSTA SILVA', unit: 'PP' as const, reasonText: 'Transferência de loja', date: at('2023-06-01') },
    { row: 12, name: 'HAMILTON CHAVES OLIVEIRA', unit: 'PP' as const, reasonText: 'Acordo mútuo', date: at('2023-02-22') },
  ];
  it('saída depois da última admissão = desligado', () => {
    expect(evaluatorExit('HAMZA EL HENNAWI', adm, dem, null)?.row).toBe(454);
  });
  it('saída antes da readmissão e transferência não contam', () => {
    expect(evaluatorExit('CRISTIANO COSTA SILVA', adm, dem, null)).toBeNull();
  });
  it('nome parecido não é a mesma pessoa', () => {
    expect(evaluatorExit('HAMILTON OLIVEIRA', adm, dem, null)).toBeNull();
  });
  it('quem avaliou depois da "saída" continua na empresa', () => {
    expect(evaluatorExit('HAMZA EL HENNAWI', adm, dem, at('2026-09-01'))).toBeNull();
  });
});

describe('cadastro que já existe no sistema', () => {
  const base = (over: Partial<ExistingEmployee> = {}): ExistingEmployee => ({
    id: 'e1', fullName: 'ERIC ZULQUES CARIOBA', admissionDate: new Date('2026-01-23T00:00:00.000Z'),
    roleDescription: 'GARÇOM', sectorId: 's-atend', unitId: 'u-pp', shift: 'NOITE', status: 'AWAITING_PERIOD_1',
    isApprentice: false, terminationReason: null, terminationDate: null, terminationNotes: null, previousStatus: null,
    period1DueDate: new Date('2026-03-09T00:00:00.000Z'), period2DueDate: new Date('2026-04-23T00:00:00.000Z'),
    evaluations: [], ...over,
  });
  const alvo = { roleDescription: 'GARÇOM', sectorId: 's-atend', unitId: 'u-pp', shift: 'NOITE' as const };

  it('corrige os prazos de quem ainda não foi avaliado (+45/+90 → +44/+89) e não mexe no cadastro', () => {
    const plano = planEmployee(admissao(), [], []);
    const m = mergeWithExisting(plano, base({ shift: 'DIA' }), alvo);
    expect(m.set.period1DueDate?.toISOString()).toBe('2026-03-08T00:00:00.000Z');
    expect(m.set.period2DueDate?.toISOString()).toBe('2026-04-22T00:00:00.000Z');
    expect(m.set).not.toHaveProperty('shift');
    expect(m.divergencias).toEqual([{ campo: 'turno', cadastro: 'DIA', planilha: 'NOITE (horário)' }]);
  });

  it('não desfaz o desligamento registrado pelo RH', () => {
    const plano = planEmployee(admissao(), [parseFormsRow(linha())], []);
    const m = mergeWithExisting(plano, base({ status: 'TERMINATED', terminationReason: 'PEDIDO_DEMISSAO', terminationDate: new Date() }), alvo);
    expect(m.set).not.toHaveProperty('status');
    expect(m.set).not.toHaveProperty('terminationReason');
  });

  it('nunca rebaixa a situação: efetivado pelo portal continua efetivado', () => {
    const plano = planEmployee(admissao(), [parseFormsRow(linha())], []); // Forms: 1º +45
    const m = mergeWithExisting(plano, base({
      status: 'HIRED',
      evaluations: [{ period: 'SECOND', cycleNumber: 1, conclusion: 'EFETIVAR', evaluationDate: new Date('2026-04-20'), externalId: null }],
    }), alvo);
    expect(m.set).not.toHaveProperty('status');
  });

  it('numera as avaliações novas depois das que já existem e não repete a importada', () => {
    const r1 = parseFormsRow(linha());
    const r2 = parseFormsRow(linha({ 0: '2026/03/01 9:00:00 AM GMT-3', 1: '2026-03-01' }));
    const plano = planEmployee(admissao(), [r1, r2], []);
    const m = mergeWithExisting(plano, base({
      status: 'AWAITING_PERIOD_2',
      evaluations: [
        { period: 'FIRST', cycleNumber: 1, conclusion: 'EXTENDER', evaluationDate: new Date('2026-02-20'), externalId: null },
        { period: 'FIRST', cycleNumber: 2, conclusion: 'EXTENDER', evaluationDate: new Date('2026-02-24'), externalId: r1.externalId },
      ],
    }), alvo);
    expect(m.evaluations.map((e) => [e.response.externalId, e.cycleNumber])).toEqual([[r2.externalId, 3]]);
  });

  it('saída nova da aba de demissões desliga e guarda a situação anterior', () => {
    const plano = planEmployee(admissao(), [], [
      { row: 1, name: 'ERIC ZULQUES CARIOBA', unit: 'PP', reasonText: 'DEMISSÃO NO CONTRATO DE EXPERIÊNCIA', date: at('2026-04-20') },
    ]);
    const m = mergeWithExisting(plano, base({ status: 'AWAITING_PERIOD_2' }), alvo);
    expect(m.set).toMatchObject({ status: 'TERMINATED', previousStatus: 'AWAITING_PERIOD_2', terminationReason: 'DISPENSA_EXPERIENCIA' });
  });
});

describe('gestores do Forms', () => {
  it('uma conta por pessoa, com escopo do rótulo + do que avaliou', () => {
    const g = planEvaluators(
      [
        { label: 'MARCIO NUNES (ADM - JK)', unit: 'JK' },
        { label: 'MARCIO NUNES (ADM - PP)', unit: 'PP' },
        { label: 'HAMILTON OLIVEIRA (ADM)', unit: 'JK' },
      ],
      [{ label: 'HAMILTON OLIVEIRA (ADM)', unit: 'PP', sector: 'DELIVERY', shift: 'DIA' }],
    );
    expect(g.map((x) => x.email)).toEqual(['hamilton.oliveira@spot.com', 'marcio.nunes@spot.com']);
    const hamilton = g[0];
    expect([...hamilton.units].sort()).toEqual(['JK', 'PP']);
    expect([...hamilton.sectors].sort()).toEqual(['ADM', 'DELIVERY']);
    expect([...hamilton.shifts]).toEqual(['DIA']);
    // Sem avaliação: os dois turnos.
    expect([...g[1].shifts].sort()).toEqual(['DIA', 'NOITE']);
  });
});

describe('desligamento', () => {
  it.each([
    ['Pedido de demissão - Aviso prévio não trabalhado', 'PEDIDO_DEMISSAO'],
    ['PEDIDO DE DEMISSÃO - JOVEM APRENDIZ', 'PEDIDO_DEMISSAO'],
    ['Demissão por Justa Causa - Abandono de emprego', 'ABANDONO_EMPREGO'],
    ['DEMISSÃO SEM JUSTA CAUSA - AVISO INDENIZADO', 'DEMISSAO_SEM_JUSTA_CAUSA'],
    ['DISPENSA NO PERÍODO DE EXPERIÊNCIA ', 'DISPENSA_EXPERIENCIA'],
    ['Termino de contrato no prazo de experiência', 'DISPENSA_EXPERIENCIA'],
    ['Acordo Mutuo - Aviso Prévio Trabalhado', 'ACORDO_MUTUO'],
    ['Término de contrato de aprendizagem', 'FIM_APRENDIZAGEM'],
    ['Contratação Cancelada', 'CONTRATACAO_CANCELADA'],
    ['RESCISÃO POR MORTE DO EMPREGADO', 'FALECIMENTO'],
    ['Demissão - Justa Causa', 'JUSTA_CAUSA'],
  ] as const)('"%s" -> %s', (texto, categoria) => {
    expect(classifyTerminationText(texto)).toBe(categoria);
  });

  it('situação ao desfazer: a última avaliação da experiência', () => {
    expect(statusFromEvaluations([])).toBe('AWAITING_PERIOD_1');
    expect(statusFromEvaluations([{ period: 'FIRST', conclusion: 'EXTENDER', evaluationDate: '2026-02-01' }])).toBe('AWAITING_PERIOD_2');
    expect(statusFromEvaluations([
      { period: 'FIRST', conclusion: 'EFETIVAR', evaluationDate: '2026-02-01' },
      { period: 'FIRST', conclusion: 'EXTENDER', evaluationDate: '2026-02-05' },
    ])).toBe('AWAITING_PERIOD_2');
    expect(statusFromEvaluations([{ period: 'SECOND', conclusion: 'DEMITIR', evaluationDate: '2026-04-01' }])).toBe('TERMINATED');
    expect(statusFromEvaluations([], true)).toBe('HIRED');
  });
});
