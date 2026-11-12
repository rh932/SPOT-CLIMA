import { describe, it, expect } from 'vitest';
import { parseCsv, parseAdmissionDate, matchLookup, previewEmployeeRows } from '../src/lib/importFuncionarios';

const units = [{ id: 'u1', name: 'Paulista' }, { id: 'u2', name: 'JK' }];
const sectors = [{ id: 's1', name: 'Salão' }, { id: 's2', name: 'Cozinha' }];
const ctx = { units, sectors, existing: [{ fullName: 'Ana Souza', unitId: 'u1' }] };
const head = ['Nome completo', 'Unidade', 'Setor', 'Cargo', 'Turno', 'Data de admissão', 'Tipo'];

describe('parseCsv', () => {
  it('detecta ; e respeita aspas e BOM', () => {
    const m = parseCsv('\uFEFFNome;Unidade\r\n"Silva; João";Paulista\r\n');
    expect(m).toEqual([['Nome', 'Unidade'], ['Silva; João', 'Paulista']]);
  });
  it('detecta vírgula', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseAdmissionDate', () => {
  it('aceita dd/mm/aaaa, ISO e data do Excel', () => {
    expect(parseAdmissionDate('05/03/2024').iso).toContain('2024-03-05');
    expect(parseAdmissionDate('2024-03-05').iso).toContain('2024-03-05');
    expect(parseAdmissionDate(new Date(Date.UTC(2024, 2, 5))).iso).toContain('2024-03-05');
  });
  it('recusa data impossível e futura', () => {
    expect(parseAdmissionDate('31/02/2024').error).toBeTruthy();
    expect(parseAdmissionDate('01/01/2999').error).toBeTruthy();
  });
  it('vazio não é erro', () => {
    expect(parseAdmissionDate('')).toEqual({ iso: null });
  });
});

describe('matchLookup', () => {
  it('ignora acento/caixa e aceita parcial único', () => {
    expect(matchLookup(sectors, 'salao').item?.id).toBe('s1');
    expect(matchLookup([{ id: 'x', name: 'Spot Paulista' }], 'paulista').item?.id).toBe('x');
  });
  it('ambíguo não resolve', () => {
    const r = matchLookup([{ id: 'a', name: 'Salão A' }, { id: 'b', name: 'Salão B' }], 'salão');
    expect(r.item).toBeNull();
    expect(r.ambiguous).toBe(true);
  });
});

describe('previewEmployeeRows', () => {
  it('falta coluna obrigatória → erro de arquivo', () => {
    const r = previewEmployeeRows([['Nome completo', 'Unidade'], ['A', 'B']], ctx);
    expect(r.fileErrors[0]).toContain('Setor');
  });

  it('linha válida vira ATIVO por padrão, turno padrão Diurno', () => {
    const r = previewEmployeeRows([head, ['Bia Lima', 'JK', 'Salão', 'Garçom', '', '10/02/2023', '']], ctx);
    expect(r.rows[0]).toMatchObject({ status: 'OK', track: 'ATIVO', shift: 'DIA', unitId: 'u2', sectorId: 's1' });
  });

  it('duplicado no banco não é sobrescrito, e na planilha só a primeira vale', () => {
    const r = previewEmployeeRows([
      head,
      ['ana souza', 'Paulista', 'Salão', '', '', '', ''],
      ['Caio Reis', 'Paulista', 'Salão', '', '', '', ''],
      ['CAIO  REIS', 'Paulista', 'Cozinha', '', '', '', ''],
      ['Caio Reis', 'JK', 'Salão', '', '', '', ''],
    ], ctx);
    expect(r.rows.map((x) => x.status)).toEqual(['DUPLICADO', 'OK', 'DUPLICADO', 'OK']);
    expect(r.counts).toEqual({ total: 4, ok: 2, duplicado: 2, erro: 0 });
  });

  it('erros: unidade, setor, turno, tipo e novo sem data', () => {
    const r = previewEmployeeRows([
      head,
      ['Dani', 'Lapa', 'Salão', '', '', '', ''],
      ['Edu', 'JK', 'Garagem', '', '', '', ''],
      ['Fabi', 'JK', 'Salão', '', 'madrugada', '', ''],
      ['Gui', 'JK', 'Salão', '', '', '', 'talvez'],
      ['Hel', 'JK', 'Salão', '', '', '', 'novo'],
    ], ctx);
    expect(r.rows.every((x) => x.status === 'ERRO')).toBe(true);
    expect(r.rows[4].messages.join(' ')).toContain('data de admissão');
  });

  it('ignora linhas em branco e avisa quando falta data ou cargo', () => {
    const r = previewEmployeeRows([head, [], ['Ivo', 'JK', 'Cozinha', '', '', '', '']], ctx);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].warnings.length).toBe(2);
    expect(r.rows[0].roleDescription).toBe('Cozinha');
  });
});
