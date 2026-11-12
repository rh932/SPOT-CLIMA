/**
 * Filtros do histórico de avaliações e feedbacks — lógica pura.
 *
 * Um registro é uma avaliação já feita. "Experiência" (1º e 2º ciclos) e
 * "Feedback" são tipos diferentes e nunca se misturam numa mesma linha;
 * treinamento tem histórico próprio, em outra aba.
 */

export type TipoRegistro = 'EXPERIENCIA' | 'FEEDBACK';

export const TIPOS_REGISTRO: { valor: TipoRegistro; rotulo: string }[] = [
  { valor: 'EXPERIENCIA', rotulo: 'Avaliação de experiência' },
  { valor: 'FEEDBACK', rotulo: 'Feedback' },
];

export function tipoDoRegistro(period: 'FIRST' | 'SECOND' | 'FEEDBACK'): TipoRegistro {
  return period === 'FEEDBACK' ? 'FEEDBACK' : 'EXPERIENCIA';
}

export interface FiltrosHistorico {
  busca: string;
  unidade: string;
  setor: string;
  /** Quem avaliou. */
  responsavel: string;
  tipo: '' | TipoRegistro;
  /** Período em que o registro foi feito, em AAAA-MM-DD (inclusivo). */
  de: string;
  ate: string;
  /** REALIZADO = registros feitos; PENDENTE = quem ainda não recebeu feedback. */
  status: '' | 'REALIZADO' | 'PENDENTE';
}

export const FILTROS_HISTORICO_VAZIOS: FiltrosHistorico = {
  busca: '', unidade: '', setor: '', responsavel: '', tipo: '', de: '', ate: '', status: '',
};

export function filtrosHistoricoAtivos(f: FiltrosHistorico): number {
  return [
    f.busca.trim() !== '', f.unidade !== '', f.setor !== '', f.responsavel !== '',
    f.tipo !== '', f.de !== '' || f.ate !== '', f.status !== '',
  ].filter(Boolean).length;
}

export interface RegistroFiltravel {
  period: 'FIRST' | 'SECOND' | 'FEEDBACK';
  evaluationDate: string;
  evaluator: string | null;
  employee: {
    fullName: string;
    sector: { name: string } | null;
    unit: { name: string } | null;
  };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarHistorico<T extends RegistroFiltravel>(rows: T[], f: FiltrosHistorico): T[] {
  const q = norm(f.busca.trim());
  return rows.filter((r) => {
    if (q && !norm(r.employee.fullName).includes(q)) return false;
    if (f.unidade && r.employee.unit?.name !== f.unidade) return false;
    if (f.setor && r.employee.sector?.name !== f.setor) return false;
    if (f.responsavel && r.evaluator !== f.responsavel) return false;
    if (f.tipo && tipoDoRegistro(r.period) !== f.tipo) return false;
    const dia = r.evaluationDate.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    return true;
  });
}

/**
 * Quando os registros filtrados são de UMA pessoa só, a leitura natural é a
 * linha do tempo dela, do primeiro registro ao mais recente; do contrário, o
 * mais recente vem primeiro.
 */
export function ordenarHistorico<T extends RegistroFiltravel & { employee: { id: string } }>(rows: T[]): { rows: T[]; cronologico: boolean } {
  const pessoas = new Set(rows.map((r) => r.employee.id));
  const cronologico = pessoas.size === 1 && rows.length > 1;
  const dir = cronologico ? 1 : -1;
  return {
    cronologico,
    rows: [...rows].sort((a, b) => dir * (new Date(a.evaluationDate).getTime() - new Date(b.evaluationDate).getTime())),
  };
}
