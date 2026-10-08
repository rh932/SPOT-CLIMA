import { utcDay, type DueDateFields } from './probation';
import { awaitsSecondEvaluation, type PeriodoAvaliacao } from './colorUnlock';

/**
 * A lista do acompanhamento: primeiro as avaliações pendentes, por loja, com
 * a 1ª e a 2ª avaliação separadas; depois o arquivo — quem já passou pela
 * experiência (efetivado ou desligado) e os aprendizes, que não têm avaliação.
 * Em cada lista, da admissão mais recente para a mais antiga.
 */

interface Lookup { id: string; name: string }

export interface GroupableEmployee extends DueDateFields {
  id: string;
  fullName: string;
  admissionDate: string;
  unit: Lookup | null;
}

/** Opcionais: quando vêm, a lista reconhece quem ainda deve a 2ª avaliação. */
interface CorFields {
  currentColor?: string | null;
  sector?: { usesColorCycle?: boolean } | null;
  evaluations?: { period: PeriodoAvaliacao }[];
}

export type Fase = 'PENDENTE_1' | 'PENDENTE_2' | 'ARQUIVADO';

export function faseDo(e: Pick<DueDateFields, 'status' | 'isApprentice'> & CorFields): Fase {
  if (e.isApprentice || e.status === 'TERMINATED') return 'ARQUIVADO';
  if (e.status === 'HIRED') {
    // Efetivado na 1ª avaliação num setor de cores ainda deve a 2ª (colorUnlock.ts).
    const deveSegunda = e.evaluations !== undefined && awaitsSecondEvaluation({
      status: e.status,
      isApprentice: e.isApprentice,
      currentColor: e.currentColor ?? null,
      usesColorCycle: Boolean(e.sector?.usesColorCycle),
      evaluations: e.evaluations,
    });
    return deveSegunda ? 'PENDENTE_2' : 'ARQUIVADO';
  }
  return e.status === 'AWAITING_PERIOD_1' ? 'PENDENTE_1' : 'PENDENTE_2';
}

export interface LojaPendente<T> { chave: string; unidade: Lookup | null; primeira: T[]; segunda: T[] }
export interface LojaArquivada<T> { chave: string; unidade: Lookup | null; itens: T[] }
export interface Acompanhamento<T> { pendentes: LojaPendente<T>[]; arquivados: LojaArquivada<T>[]; totalArquivados: number }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function maisRecentePrimeiro(a: GroupableEmployee, b: GroupableEmployee): number {
  return utcDay(b.admissionDate) - utcDay(a.admissionDate) || norm(a.fullName).localeCompare(norm(b.fullName));
}

/** Lojas na ordem do cadastro (a API já devolve assim); sem loja vai para o fim. */
function porLoja<T extends GroupableEmployee>(lista: T[], unidades: Lookup[]): { chave: string; unidade: Lookup | null; itens: T[] }[] {
  const mapa = new Map<string, { chave: string; unidade: Lookup | null; itens: T[] }>();
  for (const e of lista) {
    const chave = e.unit?.id ?? '-';
    if (!mapa.has(chave)) mapa.set(chave, { chave, unidade: e.unit, itens: [] });
    mapa.get(chave)!.itens.push(e);
  }
  const pos = (u: Lookup | null) => {
    if (!u) return Number.MAX_SAFE_INTEGER;
    const i = unidades.findIndex((x) => x.id === u.id);
    return i === -1 ? unidades.length : i;
  };
  return [...mapa.values()]
    .map((g) => ({ ...g, itens: g.itens.sort(maisRecentePrimeiro) }))
    .sort((a, b) => pos(a.unidade) - pos(b.unidade) || norm(a.unidade?.name ?? '').localeCompare(norm(b.unidade?.name ?? '')));
}

export function separarAcompanhamento<T extends GroupableEmployee>(employees: T[], unidades: Lookup[]): Acompanhamento<T> {
  const pendentes = porLoja(employees.filter((e) => faseDo(e) !== 'ARQUIVADO'), unidades).map((g) => ({
    chave: g.chave,
    unidade: g.unidade,
    primeira: g.itens.filter((e) => faseDo(e) === 'PENDENTE_1'),
    segunda: g.itens.filter((e) => faseDo(e) === 'PENDENTE_2'),
  }));
  const arquivo = employees.filter((e) => faseDo(e) === 'ARQUIVADO');
  return { pendentes, arquivados: porLoja(arquivo, unidades), totalArquivados: arquivo.length };
}
