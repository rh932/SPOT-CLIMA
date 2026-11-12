import { describe, it, expect } from 'vitest';
import { alteracoesDoColaborador, admissaoParaApi, diaDaAdmissao, type DadosDoColaborador } from '../src/lib/employeeEdit';

const atual: DadosDoColaborador = {
  fullName: 'GEOVANA GOMES MATOS',
  admissionDate: '2026-10-22',
  roleDescription: 'APRENDIZ ADMINISTRATIVO',
  sectorId: 'setor-adm-geral',
  unitId: 'unidade-paulista',
  shift: 'DIA',
};

describe('alteracoesDoColaborador', () => {
  it('não manda nada quando nada mudou', () => {
    expect(alteracoesDoColaborador(atual, { ...atual })).toEqual({});
  });

  it('não reenvia o setor sem mudança, mesmo fora da avaliação', () => {
    // Administração geral não vale para avaliação: se fosse reenviada, a rota recusaria.
    const mudanca = alteracoesDoColaborador(atual, { ...atual, roleDescription: 'APRENDIZ ADM' });
    expect(mudanca).toEqual({ roleDescription: 'APRENDIZ ADM' });
    expect(mudanca).not.toHaveProperty('sectorId');
  });

  it('envia só os campos que mudaram, com o nome sem espaços nas pontas', () => {
    const mudanca = alteracoesDoColaborador(atual, { ...atual, fullName: '  GEOVANA GOMES  ', shift: 'NOITE' });
    expect(mudanca).toEqual({ fullName: 'GEOVANA GOMES', shift: 'NOITE' });
  });

  it('converte a admissão alterada para o meio-dia que a API grava', () => {
    const mudanca = alteracoesDoColaborador(atual, { ...atual, admissionDate: '2026-10-19' });
    expect(mudanca.admissionDate).toBe(admissaoParaApi('2026-10-19'));
    expect(mudanca.admissionDate).toBe(new Date('2026-10-19T12:00:00').toISOString());
  });

  it('troca de setor e de unidade quando o usuário escolhe outra', () => {
    const mudanca = alteracoesDoColaborador(atual, { ...atual, sectorId: 'setor-rh', unitId: 'unidade-jk' });
    expect(mudanca).toEqual({ sectorId: 'setor-rh', unitId: 'unidade-jk' });
  });
});

describe('diaDaAdmissao', () => {
  it('lê o dia de calendário da admissão gravada ao meio-dia UTC', () => {
    expect(diaDaAdmissao('2026-10-22T12:00:00.000Z')).toBe('2026-10-22');
  });
});
