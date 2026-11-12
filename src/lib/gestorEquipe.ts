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

export type OrdemEquipe = '' | 'NOME' | 'ADMISSAO_DESC' | 'ADMISSAO_ASC' | 'SETOR' | 'STATUS';

export const ORDENS_EQUIPE: { valor: OrdemEquipe; rotulo: string }[] = [
  { valor: '', rotulo: 'Padrão da tela' },
  { valor: 'NOME', rotulo: 'Nome (A–Z)' },
  { valor: 'ADMISSAO_DESC', rotulo: 'Admissão (mais recente)' },
  { valor: 'ADMISSAO_ASC', rotulo: 'Admissão (mais antiga)' },
  { valor: 'SETOR', rotulo: 'Setor' },
  { valor: 'STATUS', rotulo: 'Situação' },
];

export interface FiltrosEquipe {
  busca: string;
  unidade: string;
  setor: string;
  turno: '' | 'DIA' | 'NOITE';
  /** Situação do processo da tela (cada tela define as suas — ver ExtrasFiltro.statusDe). */
  status: string;
  /** Etapa (ex.: 1ª ou 2ª avaliação de experiência). */
  etapa: string;
  /** Nome do gestor/gerente/treinador responsável. */
  responsavel: string;
  /** Período de admissão, em AAAA-MM-DD (inclusivo nos dois lados). */
  admissaoDe: string;
  admissaoAte: string;
  /** Ordenação; vazio = a ordem própria da tela. Não conta como filtro. */
  ordem: OrdemEquipe;
}

export const FILTROS_VAZIOS: FiltrosEquipe = {
  busca: '', unidade: '', setor: '', turno: '',
  status: '', etapa: '', responsavel: '', admissaoDe: '', admissaoAte: '', ordem: '',
};

export interface PessoaFiltravel {
  fullName: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  admissionDate?: string;
  sector: { name: string } | null;
  unit: { name: string } | null;
}

/** Como cada tela responde "qual a situação / etapa / responsável desta pessoa?". */
export interface ExtrasFiltro<T> {
  statusDe?: (e: T) => string;
  etapaDe?: (e: T) => string;
  responsaveisDe?: (e: T) => string[];
}

/** Sem acento e sem caixa: "joao" acha "João". */
export const normalizaTexto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Dia (AAAA-MM-DD) em UTC de uma data ISO — a admissão é um dia de calendário. */
const diaUTC = (iso: string) => iso.slice(0, 10);

export function filtrarEquipe<T extends PessoaFiltravel>(lista: T[], f: FiltrosEquipe, extras: ExtrasFiltro<T> = {}): T[] {
  const q = normalizaTexto(f.busca.trim());
  return lista.filter((e) => {
    if (q
      && !normalizaTexto(e.fullName).includes(q)
      && !normalizaTexto(e.roleDescription).includes(q)
      && !normalizaTexto(e.sector?.name ?? '').includes(q)) return false;
    if (f.unidade && e.unit?.name !== f.unidade) return false;
    if (f.setor && e.sector?.name !== f.setor) return false;
    if (f.turno && e.shift !== f.turno) return false;
    if (f.status && extras.statusDe?.(e) !== f.status) return false;
    if (f.etapa && extras.etapaDe?.(e) !== f.etapa) return false;
    if (f.responsavel && !(extras.responsaveisDe?.(e) ?? []).includes(f.responsavel)) return false;
    if (f.admissaoDe || f.admissaoAte) {
      if (!e.admissionDate) return false;
      const dia = diaUTC(e.admissionDate);
      if (f.admissaoDe && dia < f.admissaoDe) return false;
      if (f.admissaoAte && dia > f.admissaoAte) return false;
    }
    return true;
  });
}

/** Ordena uma cópia da lista. `ordem` vazia devolve a lista como veio (a ordem própria da tela). */
export function ordenarEquipe<T extends PessoaFiltravel>(lista: T[], ordem: OrdemEquipe, extras: ExtrasFiltro<T> = {}): T[] {
  if (!ordem) return lista;
  const cmpTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
  const adm = (e: T) => (e.admissionDate ? new Date(e.admissionDate).getTime() : 0);
  const copia = [...lista];
  switch (ordem) {
    case 'NOME': return copia.sort((a, b) => cmpTexto(a.fullName, b.fullName));
    case 'ADMISSAO_DESC': return copia.sort((a, b) => adm(b) - adm(a) || cmpTexto(a.fullName, b.fullName));
    case 'ADMISSAO_ASC': return copia.sort((a, b) => adm(a) - adm(b) || cmpTexto(a.fullName, b.fullName));
    case 'SETOR': return copia.sort((a, b) => cmpTexto(a.sector?.name ?? '', b.sector?.name ?? '') || cmpTexto(a.fullName, b.fullName));
    case 'STATUS': return copia.sort((a, b) => cmpTexto(extras.statusDe?.(a) ?? '', extras.statusDe?.(b) ?? '') || cmpTexto(a.fullName, b.fullName));
    default: return lista;
  }
}

/** Nomes distintos, em ordem alfabética, para preencher os seletores. */
export function opcoesDe(lista: (string | null | undefined)[]): string[] {
  return [...new Set(lista.filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Quantos filtros estão ligados (a ordenação não conta). */
export function filtrosAtivos(f: FiltrosEquipe): number {
  return [
    f.busca.trim() !== '', f.unidade !== '', f.setor !== '', f.turno !== '',
    f.status !== '', f.etapa !== '', f.responsavel !== '', f.admissaoDe !== '' || f.admissaoAte !== '',
  ].filter(Boolean).length;
}

// ------------------------------------------------------------------
// Situação do treinamento de um colaborador.
// ------------------------------------------------------------------

export type StatusTreinamento = 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'PENDENTE' | 'CONCLUIDO';

export const STATUS_TREINAMENTO: { valor: StatusTreinamento; rotulo: string }[] = [
  { valor: 'NAO_INICIADO', rotulo: 'Não iniciado' },
  { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
  { valor: 'PENDENTE', rotulo: 'Pendente (reforço)' },
  { valor: 'CONCLUIDO', rotulo: 'Concluído' },
];

/**
 * Concluído = todos os tipos de treinamento ativos foram encerrados em
 * definitivo para a pessoa. Pendente = ainda não concluiu e tem reforço
 * marcado. Em andamento = já treinou algo. Não iniciado = nenhuma ficha.
 */
export function statusDoTreinamento(
  trainings: { trainingTypeId: string; closure: string; needsReinforcement: boolean }[],
  tipoIds: string[],
): StatusTreinamento {
  const concluido = tipoIds.length > 0
    && tipoIds.every((id) => trainings.some((t) => t.trainingTypeId === id && t.closure === 'DEFINITIVO'));
  if (concluido) return 'CONCLUIDO';
  if (trainings.some((t) => t.needsReinforcement)) return 'PENDENTE';
  return trainings.length > 0 ? 'EM_ANDAMENTO' : 'NAO_INICIADO';
}
