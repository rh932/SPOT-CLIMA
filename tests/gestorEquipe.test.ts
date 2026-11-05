import { describe, it, expect } from 'vitest';
import {
  admissoesNoPeriodo, ARQUIVO_APOS_MESES, filtrarEquipe, FILTROS_VAZIOS, filtrosAtivos, limiteArquivo, noArquivo,
  opcoesDe, pertoDeVencer,
} from '@/lib/gestorEquipe';

// 05/11/2026 às 12:00 em São Paulo (15:00 UTC).
const AGORA = new Date('2026-11-05T15:00:00Z');

describe('arquivo de treinamentos', () => {
  it(`corta em ${ARQUIVO_APOS_MESES} meses`, () => {
    expect(limiteArquivo(AGORA).toISOString()).toBe('2026-05-05T15:00:00.000Z');
  });

  it('treinamento de mais de 6 meses vai para o arquivo; o recente fica na lista', () => {
    expect(noArquivo('2026-05-04T12:00:00Z', AGORA)).toBe(true);
    expect(noArquivo('2026-05-06T12:00:00Z', AGORA)).toBe(false);
    expect(noArquivo(new Date('2025-01-10T12:00:00Z'), AGORA)).toBe(true);
  });
});

describe('últimas admissões por período', () => {
  const pessoas = [
    { id: 'a', admissionDate: '2026-11-03T00:00:00Z' },
    { id: 'b', admissionDate: '2026-10-20T00:00:00Z' },
    { id: 'c', admissionDate: '2026-08-10T00:00:00Z' },
    { id: 'd', admissionDate: '2026-03-02T00:00:00Z' },
    { id: 'futuro', admissionDate: '2026-12-01T00:00:00Z' },
  ];

  it('30 dias: só quem entrou no último mês, da mais recente para a mais antiga', () => {
    expect(admissoesNoPeriodo(pessoas, '30', AGORA).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('90 dias pega a admissão de agosto; admissão futura não conta', () => {
    expect(admissoesNoPeriodo(pessoas, '90', AGORA).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('este ano começa em 1º de janeiro', () => {
    expect(admissoesNoPeriodo(pessoas, 'ANO', AGORA).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('perto de vencer', () => {
  it('vence em até 7 dias, ou já passou, entra; mais que isso não', () => {
    expect(pertoDeVencer('2026-11-12T12:00:00Z', AGORA)).toBe(true);
    expect(pertoDeVencer('2026-11-13T12:00:00Z', AGORA)).toBe(false);
    expect(pertoDeVencer('2026-11-02T12:00:00Z', AGORA)).toBe(true);
  });

  it('sem prazo não entra', () => {
    expect(pertoDeVencer(null, AGORA)).toBe(false);
    expect(pertoDeVencer(undefined, AGORA)).toBe(false);
  });
});

describe('filtros de pesquisa da equipe', () => {
  const equipe = [
    { fullName: 'João Silva', roleDescription: 'Garçom', shift: 'DIA' as const, sector: { name: 'Salão - Bar' }, unit: { name: 'Paulista' } },
    { fullName: 'Maria Souza', roleDescription: 'Bartender', shift: 'NOITE' as const, sector: { name: 'Salão - Bar' }, unit: { name: 'JK' } },
    { fullName: 'Ana Lima', roleDescription: 'Garçonete', shift: 'NOITE' as const, sector: { name: 'Salão - Atendimento' }, unit: { name: 'Paulista' } },
  ];

  it('busca ignora acento e caixa, e acha pelo nome, cargo ou setor', () => {
    expect(filtrarEquipe(equipe, { ...FILTROS_VAZIOS, busca: 'JOAO' }).map((e) => e.fullName)).toEqual(['João Silva']);
    expect(filtrarEquipe(equipe, { ...FILTROS_VAZIOS, busca: 'garço' }).map((e) => e.fullName)).toEqual(['João Silva', 'Ana Lima']);
    expect(filtrarEquipe(equipe, { ...FILTROS_VAZIOS, busca: 'atendimento' }).map((e) => e.fullName)).toEqual(['Ana Lima']);
  });

  it('unidade, setor e turno se combinam', () => {
    expect(filtrarEquipe(equipe, { ...FILTROS_VAZIOS, unidade: 'Paulista' })).toHaveLength(2);
    expect(filtrarEquipe(equipe, { ...FILTROS_VAZIOS, setor: 'Salão - Bar', turno: 'NOITE' }).map((e) => e.fullName)).toEqual(['Maria Souza']);
  });

  it('conta os filtros ativos', () => {
    expect(filtrosAtivos(FILTROS_VAZIOS)).toBe(0);
    expect(filtrosAtivos({ busca: ' ', unidade: 'JK', setor: '', turno: 'DIA' })).toBe(2);
  });

  it('opções de seletor: distintas, ordenadas, sem vazios', () => {
    expect(opcoesDe(['JK', null, 'Paulista', 'JK', undefined])).toEqual(['JK', 'Paulista'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
});
