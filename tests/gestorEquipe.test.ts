import { describe, it, expect } from 'vitest';
import {
  admissoesNoPeriodo, ARQUIVO_APOS_MESES, filtrarEquipe, FILTROS_VAZIOS, filtrosAtivos, limiteArquivo, noArquivo,
  opcoesDe, ordenarEquipe, pertoDeVencer, separarArquivoDoTreino, statusDoTreinamento,
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

describe('lista de treino e arquivo', () => {
  const dia = (d: string) => `${d}T00:00:00Z`;
  const gente = [
    { id: '1', admissionDate: dia('2026-11-04') },
    { id: '2', admissionDate: dia('2026-11-02') },
    { id: '3', admissionDate: dia('2026-10-30') },
    { id: '4', admissionDate: dia('2026-10-25') },
    { id: '5', admissionDate: dia('2026-10-20') },
    { id: 'g', admissionDate: dia('2026-11-03'), criadoPorGerente: true },
    { id: 'velho', admissionDate: dia('2025-01-10') },
  ];

  it('só as 4 mais novas ficam na lista; o resto vai para o arquivo, do mais novo ao mais antigo', () => {
    const { recentes, arquivo } = separarArquivoDoTreino(gente, '30', AGORA);
    expect(recentes.map((p) => p.id)).toEqual(['1', '2', '3', '4']);
    expect(arquivo.map((p) => p.id)).toEqual(['g', '5', 'velho']);
  });

  it('quem foi criado por gerente não conta entre as 4, mesmo sendo recente', () => {
    const { recentes, arquivo } = separarArquivoDoTreino(gente, '30', AGORA);
    expect(recentes.some((p) => p.id === 'g')).toBe(false);
    expect(arquivo.some((p) => p.id === 'g')).toBe(true);
  });

  it('quem entrou antes do período escolhido vai para o arquivo', () => {
    // Em 15/12, os 30 dias começam em 15/11: ninguém entrou nesse intervalo.
    const { recentes, arquivo } = separarArquivoDoTreino(gente, '30', new Date('2026-12-15T15:00:00Z'));
    expect(recentes).toEqual([]);
    expect(arquivo).toHaveLength(gente.length);
  });

  it('ninguém some: lista + arquivo = todos', () => {
    const { recentes, arquivo } = separarArquivoDoTreino(gente, 'ANO', AGORA);
    expect(recentes.length + arquivo.length).toBe(gente.length);
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
    expect(filtrosAtivos({ ...FILTROS_VAZIOS, busca: ' ', unidade: 'JK', turno: 'DIA' })).toBe(2);
    // período de admissão conta como um filtro só; ordenar não conta.
    expect(filtrosAtivos({ ...FILTROS_VAZIOS, admissaoDe: '2026-01-01', admissaoAte: '2026-02-01', ordem: 'NOME' })).toBe(1);
  });

  it('combina situação, etapa, responsável e período de admissão', () => {
    const lista = [
      { fullName: 'Ana', roleDescription: 'x', shift: 'DIA' as const, admissionDate: '2026-01-10T12:00:00.000Z', sector: { name: 'Salão' }, unit: { name: 'JK' }, st: 'PENDENTE', et: 'SEGUNDA', resp: ['Carla'] },
      { fullName: 'Bia', roleDescription: 'x', shift: 'DIA' as const, admissionDate: '2026-03-10T12:00:00.000Z', sector: { name: 'Salão' }, unit: { name: 'JK' }, st: 'PENDENTE', et: 'PRIMEIRA', resp: ['Carla'] },
      { fullName: 'Caio', roleDescription: 'x', shift: 'DIA' as const, admissionDate: '2026-03-12T12:00:00.000Z', sector: { name: 'Salão' }, unit: { name: 'Paulista' }, st: 'ATRASADA', et: 'SEGUNDA', resp: ['Dora'] },
    ];
    const extras = { statusDe: (e: (typeof lista)[number]) => e.st, etapaDe: (e: (typeof lista)[number]) => e.et, responsaveisDe: (e: (typeof lista)[number]) => e.resp };
    // "JK, segunda avaliação pendente"
    expect(filtrarEquipe(lista, { ...FILTROS_VAZIOS, unidade: 'JK', etapa: 'SEGUNDA', status: 'PENDENTE' }, extras).map((e) => e.fullName)).toEqual(['Ana']);
    expect(filtrarEquipe(lista, { ...FILTROS_VAZIOS, responsavel: 'Dora' }, extras).map((e) => e.fullName)).toEqual(['Caio']);
    expect(filtrarEquipe(lista, { ...FILTROS_VAZIOS, admissaoDe: '2026-03-01', admissaoAte: '2026-03-10' }, extras).map((e) => e.fullName)).toEqual(['Bia']);
    expect(filtrarEquipe(lista, { ...FILTROS_VAZIOS, admissaoDe: '2026-03-11' }, extras).map((e) => e.fullName)).toEqual(['Caio']);
  });

  it('ordena por nome, admissão e setor sem alterar a lista original', () => {
    const lista = [
      { fullName: 'Élio', roleDescription: '', shift: 'DIA' as const, admissionDate: '2026-02-01T12:00:00.000Z', sector: { name: 'Salão - Bar' }, unit: null },
      { fullName: 'Ana', roleDescription: '', shift: 'DIA' as const, admissionDate: '2026-03-01T12:00:00.000Z', sector: { name: 'Salão - Atendimento' }, unit: null },
    ];
    expect(ordenarEquipe(lista, 'NOME').map((e) => e.fullName)).toEqual(['Ana', 'Élio']);
    expect(ordenarEquipe(lista, 'ADMISSAO_ASC').map((e) => e.fullName)).toEqual(['Élio', 'Ana']);
    expect(ordenarEquipe(lista, 'SETOR').map((e) => e.fullName)).toEqual(['Ana', 'Élio']);
    expect(ordenarEquipe(lista, '')).toBe(lista);
    expect(lista[0].fullName).toBe('Élio');
  });

  it('opções de seletor: distintas, ordenadas, sem vazios', () => {
    expect(opcoesDe(['JK', null, 'Paulista', 'JK', undefined])).toEqual(['JK', 'Paulista'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
});

describe('statusDoTreinamento', () => {
  const t = (id: string, closure: string, reforco = false) => ({ trainingTypeId: id, closure, needsReinforcement: reforco });
  it('não iniciado, em andamento, pendente e concluído', () => {
    expect(statusDoTreinamento([], ['a', 'b'])).toBe('NAO_INICIADO');
    expect(statusDoTreinamento([t('a', 'DIA')], ['a', 'b'])).toBe('EM_ANDAMENTO');
    expect(statusDoTreinamento([t('a', 'DIA', true)], ['a', 'b'])).toBe('PENDENTE');
    expect(statusDoTreinamento([t('a', 'DEFINITIVO'), t('b', 'DEFINITIVO')], ['a', 'b'])).toBe('CONCLUIDO');
  });
  it('um tipo encerrado não basta quando há outros', () => {
    expect(statusDoTreinamento([t('a', 'DEFINITIVO')], ['a', 'b'])).toBe('EM_ANDAMENTO');
  });
  it('sem tipos cadastrados nunca conclui', () => {
    expect(statusDoTreinamento([t('a', 'DEFINITIVO')], [])).toBe('EM_ANDAMENTO');
  });
});
