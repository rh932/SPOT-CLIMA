import { daysUntilDueDay } from './probation';

/**
 * Regras das abas de Treinamento e Feedback do portal do gestor: arquivo de
 * treinamentos antigos, últimas admissões por período, "perto de vencer" e os
 * filtros de pesquisa. Ficam aqui (sem banco, sem React) para o cliente e a
 * rota de apagar usarem a MESMA data de corte.
 */

/** Treinamento com mais de tantos meses sai da lista e vai para o Arquivo. */
export const ARQUIVO_APOS_MESES = 6;

/** Vence em até tantos dias (ou já venceu) entra na coluna "Perto de vencer". */
export const PERTO_DE_VENCER_DIAS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Data de corte do arquivo: treinamentos anteriores a ela estão arquivados. */
export function limiteArquivo(agora: Date = new Date()): Date {
  const limite = new Date(agora.getTime());
  limite.setUTCMonth(limite.getUTCMonth() - ARQUIVO_APOS_MESES);
  return limite;
}

export function noArquivo(trainingDate: string | Date, agora: Date = new Date()): boolean {
  return new Date(trainingDate).getTime() < limiteArquivo(agora).getTime();
}

// ------------------------------------------------------------------
// Últimas admissões ("quem entrou na loja"), por período.
// ------------------------------------------------------------------

export type PeriodoAdmissao = '30' | '90' | '180' | 'ANO';

export const PERIODOS_ADMISSAO: { valor: PeriodoAdmissao; rotulo: string }[] = [
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: '180', rotulo: '6 meses' },
  { valor: 'ANO', rotulo: 'Este ano' },
];

/**
 * Admitidos dentro do período, da admissão mais recente para a mais antiga.
 * Admissão com data futura não conta: ainda não entrou na loja.
 */
export function admissoesNoPeriodo<T extends { admissionDate: string }>(
  lista: T[],
  periodo: PeriodoAdmissao,
  agora: Date = new Date(),
): T[] {
  const fim = agora.getTime();
  const inicio = periodo === 'ANO'
    ? Date.UTC(agora.getUTCFullYear(), 0, 1)
    : fim - Number(periodo) * DIA_MS;
  return lista
    .filter((e) => {
      const t = new Date(e.admissionDate).getTime();
      return t >= inicio && t <= fim;
    })
    .sort((a, b) => new Date(b.admissionDate).getTime() - new Date(a.admissionDate).getTime());
}

/** Quantas admissões ficam na lista da aba Treinar; todas as outras vão para o Arquivo. */
export const ULTIMAS_ADMISSOES = 4;

/**
 * Divide a lista da aba Treinar: as ULTIMAS_ADMISSOES mais novas do período
 * ficam na lista; o resto — inclusive quem foi cadastrado por um gerente, que
 * não conta entre as últimas — vai para o Arquivo, também do mais novo ao mais
 * antigo.
 */
export function separarArquivoDoTreino<T extends { id: string; admissionDate: string; criadoPorGerente?: boolean }>(
  lista: T[],
  periodo: PeriodoAdmissao,
  agora: Date = new Date(),
  quantas: number = ULTIMAS_ADMISSOES,
): { recentes: T[]; arquivo: T[] } {
  const recentes = admissoesNoPeriodo(lista.filter((e) => !e.criadoPorGerente), periodo, agora).slice(0, quantas);
  const naLista = new Set(recentes.map((e) => e.id));
  const arquivo = lista
    .filter((e) => !naLista.has(e.id))
    .sort((a, b) => new Date(b.admissionDate).getTime() - new Date(a.admissionDate).getTime());
  return { recentes, arquivo };
}

// ------------------------------------------------------------------
// Perto de vencer.
// ------------------------------------------------------------------

/**
 * `prazo` é o vencimento em aberto da pessoa (fim do contrato de experiência
 * ou próximo feedback). Vencido e ainda não atendido também conta: é o que
 * mais precisa de atenção.
 */
export function pertoDeVencer(
  prazo: string | Date | null | undefined,
  agora: Date = new Date(),
  dias: number = PERTO_DE_VENCER_DIAS,
): boolean {
  if (!prazo) return false;
  return daysUntilDueDay(prazo, agora) <= dias;
}

// ------------------------------------------------------------------
// Filtros de pesquisa (mesma ideia da aba de colaboradores do admin).
// ------------------------------------------------------------------

export interface FiltrosEquipe {
  busca: string;
  unidade: string;
  setor: string;
  turno: '' | 'DIA' | 'NOITE';
}

export const FILTROS_VAZIOS: FiltrosEquipe = { busca: '', unidade: '', setor: '', turno: '' };

export interface PessoaFiltravel {
  fullName: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  sector: { name: string } | null;
  unit: { name: string } | null;
}

/** Sem acento e sem caixa: "joao" acha "João". */
export const normalizaTexto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarEquipe<T extends PessoaFiltravel>(lista: T[], f: FiltrosEquipe): T[] {
  const q = normalizaTexto(f.busca.trim());
  return lista.filter((e) =>
    (!q
      || normalizaTexto(e.fullName).includes(q)
      || normalizaTexto(e.roleDescription).includes(q)
      || normalizaTexto(e.sector?.name ?? '').includes(q))
    && (!f.unidade || e.unit?.name === f.unidade)
    && (!f.setor || e.sector?.name === f.setor)
    && (!f.turno || e.shift === f.turno));
}

/** Nomes distintos, em ordem alfabética, para preencher os seletores. */
export function opcoesDe(lista: (string | null | undefined)[]): string[] {
  return [...new Set(lista.filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function filtrosAtivos(f: FiltrosEquipe): number {
  return [f.busca.trim() !== '', f.unidade !== '', f.setor !== '', f.turno !== ''].filter(Boolean).length;
}
