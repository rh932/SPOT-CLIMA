import { describe, it, expect } from 'vitest';
import { faseDo, separarAcompanhamento, type GroupableEmployee } from '../src/lib/employeeGroups';

const PAULISTA = { id: 'u1', name: 'PAULISTA' };
const JK = { id: 'u2', name: 'JK' };

let seq = 0;
function emp(p: Partial<GroupableEmployee> & { fullName: string; admissionDate: string }): GroupableEmployee {
  seq += 1;
  return {
    id: `e${seq}`,
    status: 'AWAITING_PERIOD_1',
    period1DueDate: '2026-01-01T00:00:00.000Z',
    period2DueDate: '2026-01-01T00:00:00.000Z',
    unit: PAULISTA,
    ...p,
  };
}

const nomes = (xs: GroupableEmployee[]) => xs.map((x) => x.fullName);

describe('faseDo', () => {
  it('pendente só quem aguarda avaliação; aprendiz, efetivado e desligado vão para o arquivo', () => {
    expect(faseDo({ status: 'AWAITING_PERIOD_1' })).toBe('PENDENTE_1');
    expect(faseDo({ status: 'AWAITING_PERIOD_2' })).toBe('PENDENTE_2');
    expect(faseDo({ status: 'HIRED' })).toBe('ARQUIVADO');
    expect(faseDo({ status: 'TERMINATED' })).toBe('ARQUIVADO');
    expect(faseDo({ status: 'HIRED', isApprentice: true })).toBe('ARQUIVADO');
  });
});

describe('separarAcompanhamento', () => {
  const lista = [
    emp({ fullName: 'JK antigo 1º', admissionDate: '2026-06-01T12:00:00Z', unit: JK }),
    emp({ fullName: 'JK novo 1º', admissionDate: '2026-09-20T00:00:00Z', unit: JK }),
    emp({ fullName: 'Paulista 2º', admissionDate: '2026-07-01T12:00:00Z', status: 'AWAITING_PERIOD_2' }),
    emp({ fullName: 'Paulista 1º', admissionDate: '2026-09-01T15:00:00Z' }),
    emp({ fullName: 'Efetivado', admissionDate: '2026-05-01T12:00:00Z', status: 'HIRED' }),
    emp({ fullName: 'Desligado', admissionDate: '2026-08-01T12:00:00Z', status: 'TERMINATED' }),
    emp({ fullName: 'Aprendiz JK', admissionDate: '2026-08-01T12:00:00Z', status: 'HIRED', isApprentice: true, unit: JK }),
  ];
  const r = separarAcompanhamento(lista, [PAULISTA, JK]);

  it('pendentes por loja na ordem do cadastro, 1ª e 2ª separadas, mais recente primeiro', () => {
    expect(r.pendentes.map((l) => l.unidade?.name)).toEqual(['PAULISTA', 'JK']);
    expect(nomes(r.pendentes[0].primeira)).toEqual(['Paulista 1º']);
    expect(nomes(r.pendentes[0].segunda)).toEqual(['Paulista 2º']);
    expect(nomes(r.pendentes[1].primeira)).toEqual(['JK novo 1º', 'JK antigo 1º']);
    expect(r.pendentes[1].segunda).toEqual([]);
  });

  it('arquivo depois, também por loja e mais recente primeiro', () => {
    expect(r.totalArquivados).toBe(3);
    expect(r.arquivados.map((l) => l.unidade?.name)).toEqual(['PAULISTA', 'JK']);
    expect(nomes(r.arquivados[0].itens)).toEqual(['Desligado', 'Efetivado']);
    expect(nomes(r.arquivados[1].itens)).toEqual(['Aprendiz JK']);
  });

  it('compara o dia da admissão, não a hora gravada; empate vai pelo nome', () => {
    const x = separarAcompanhamento([
      emp({ fullName: 'Bruna', admissionDate: '2026-09-01T00:00:00Z' }),
      emp({ fullName: 'Álvaro', admissionDate: '2026-09-01T15:00:00Z' }),
    ], [PAULISTA]);
    expect(nomes(x.pendentes[0].primeira)).toEqual(['Álvaro', 'Bruna']);
  });

  it('cadastro sem loja vai para o fim', () => {
    const x = separarAcompanhamento([
      emp({ fullName: 'Sem loja', admissionDate: '2026-09-01T12:00:00Z', unit: null }),
      emp({ fullName: 'Com loja', admissionDate: '2026-09-01T12:00:00Z', unit: JK }),
    ], [PAULISTA, JK]);
    expect(x.pendentes.map((l) => l.unidade?.name ?? null)).toEqual(['JK', null]);
  });
});
