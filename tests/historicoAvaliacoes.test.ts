import { describe, it, expect } from 'vitest';
import {
  FILTROS_HISTORICO_VAZIOS, filtrarHistorico, filtrosHistoricoAtivos, ordenarHistorico, tipoDoRegistro,
} from '../src/lib/historicoAvaliacoes';

const reg = (id: string, nome: string, period: 'FIRST' | 'SECOND' | 'FEEDBACK', data: string, evaluator: string, unit = 'JK', sector = 'Salão') => ({
  employee: { id, fullName: nome, unit: { name: unit }, sector: { name: sector } },
  period, evaluationDate: `${data}T12:00:00.000Z`, evaluator,
});

const rows = [
  reg('1', 'Ana Souza', 'FIRST', '2026-01-10', 'Carla'),
  reg('1', 'Ana Souza', 'SECOND', '2026-02-20', 'Carla'),
  reg('1', 'Ana Souza', 'FEEDBACK', '2026-05-02', 'Dora'),
  reg('2', 'Bia Lima', 'FEEDBACK', '2026-05-15', 'Dora', 'Paulista'),
];

describe('filtrarHistorico', () => {
  it('tipo separa experiência de feedback', () => {
    expect(tipoDoRegistro('FIRST')).toBe('EXPERIENCIA');
    expect(tipoDoRegistro('FEEDBACK')).toBe('FEEDBACK');
    expect(filtrarHistorico(rows, { ...FILTROS_HISTORICO_VAZIOS, tipo: 'EXPERIENCIA' })).toHaveLength(2);
  });

  it('combina unidade, responsável e período: feedbacks do Dora em maio na Paulista', () => {
    const r = filtrarHistorico(rows, { ...FILTROS_HISTORICO_VAZIOS, unidade: 'Paulista', responsavel: 'Dora', tipo: 'FEEDBACK', de: '2026-05-01', ate: '2026-05-31' });
    expect(r.map((x) => x.employee.fullName)).toEqual(['Bia Lima']);
  });

  it('busca ignora acento e o período é inclusivo', () => {
    expect(filtrarHistorico(rows, { ...FILTROS_HISTORICO_VAZIOS, busca: 'souza' })).toHaveLength(3);
    expect(filtrarHistorico(rows, { ...FILTROS_HISTORICO_VAZIOS, de: '2026-05-02', ate: '2026-05-02' })).toHaveLength(1);
  });

  it('conta filtros ativos (período = um filtro)', () => {
    expect(filtrosHistoricoAtivos(FILTROS_HISTORICO_VAZIOS)).toBe(0);
    expect(filtrosHistoricoAtivos({ ...FILTROS_HISTORICO_VAZIOS, de: '2026-01-01', ate: '2026-02-01', tipo: 'FEEDBACK' })).toBe(2);
  });
});

describe('ordenarHistorico', () => {
  it('uma pessoa só: linha do tempo do mais antigo ao mais novo', () => {
    const r = ordenarHistorico(filtrarHistorico(rows, { ...FILTROS_HISTORICO_VAZIOS, busca: 'ana' }));
    expect(r.cronologico).toBe(true);
    expect(r.rows.map((x) => x.period)).toEqual(['FIRST', 'SECOND', 'FEEDBACK']);
  });

  it('várias pessoas: mais recente primeiro', () => {
    const r = ordenarHistorico(rows);
    expect(r.cronologico).toBe(false);
    expect(r.rows[0].employee.fullName).toBe('Bia Lima');
  });
});
