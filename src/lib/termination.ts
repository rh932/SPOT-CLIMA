/**
 * Desligamento registrado pelo RH — lógica pura, sem I/O.
 *
 * O DP escreve o motivo em texto livre e com muitas variações ("Pedido de
 * demissão - Aviso prévio não trabalhado", "PEDIDO DE DEMISSÃO - JOVEM
 * APRENDIZ", "DISPENSA NO PERÍODO DE EXPERIÊNCIA "). O texto fica guardado como
 * veio (terminationNotes); a categoria abaixo é o que filtra e conta.
 */

export const TERMINATION_REASONS = [
  'DISPENSA_EXPERIENCIA',
  'PEDIDO_DEMISSAO',
  'DEMISSAO_SEM_JUSTA_CAUSA',
  'JUSTA_CAUSA',
  'ABANDONO_EMPREGO',
  'ACORDO_MUTUO',
  'FIM_APRENDIZAGEM',
  'CONTRATACAO_CANCELADA',
  'FALECIMENTO',
  'OUTRO',
] as const;

export type TerminationReason = (typeof TERMINATION_REASONS)[number];

export const TERMINATION_LABELS: Record<TerminationReason, string> = {
  DISPENSA_EXPERIENCIA: 'Dispensa na experiência',
  PEDIDO_DEMISSAO: 'Pedido de demissão',
  DEMISSAO_SEM_JUSTA_CAUSA: 'Demissão sem justa causa',
  JUSTA_CAUSA: 'Justa causa',
  ABANDONO_EMPREGO: 'Abandono de emprego',
  ACORDO_MUTUO: 'Acordo mútuo',
  FIM_APRENDIZAGEM: 'Fim do contrato de aprendizagem',
  CONTRATACAO_CANCELADA: 'Contratação cancelada',
  FALECIMENTO: 'Falecimento',
  OUTRO: 'Outro motivo',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Categoria a partir do texto do DP. A ordem importa: "Demissão por Justa
 * Causa - Abandono de emprego" é abandono, e "Pedido de demissão - Jovem
 * aprendiz" é pedido de demissão, não fim de aprendizagem.
 */
export function classifyTerminationText(texto: string | null | undefined): TerminationReason {
  const t = semAcento(texto ?? '');
  if (!t.trim()) return 'OUTRO';
  if (t.includes('ABANDONO')) return 'ABANDONO_EMPREGO';
  if (t.includes('MORTE') || t.includes('FALECIMENTO') || t.includes('OBITO')) return 'FALECIMENTO';
  if (t.includes('CANCELAD')) return 'CONTRATACAO_CANCELADA';
  if (t.includes('ACORDO')) return 'ACORDO_MUTUO';
  if (t.includes('PEDIDO')) return 'PEDIDO_DEMISSAO';
  if (t.includes('APRENDIZ') || t.includes('APRENDIZAGEM')) return 'FIM_APRENDIZAGEM';
  if (t.includes('SEM JUSTA') || t.includes('SEM JC')) return 'DEMISSAO_SEM_JUSTA_CAUSA';
  if (t.includes('JUSTA CAUSA')) return 'JUSTA_CAUSA';
  if (t.includes('EXPERIENCIA') || t.includes('DISPENSA') || t.includes('TERMINO')) return 'DISPENSA_EXPERIENCIA';
  if (t.includes('DEMISSAO') || t.includes('RESCISAO')) return 'DISPENSA_EXPERIENCIA';
  return 'OUTRO';
}

export type ProbationStatus = 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';

interface EvaluationForStatus {
  period: 'FIRST' | 'SECOND' | 'FEEDBACK';
  conclusion: 'DEMITIR' | 'EFETIVAR' | 'EXTENDER' | null;
  evaluationDate: Date | string;
}

/**
 * Situação que o funcionário volta a ter quando o RH desfaz um desligamento:
 * a mesma que as avaliações registradas dão. Vale a mais recente da
 * experiência — com dois gestores no setor, os dois podem ter avaliado o
 * mesmo período.
 */
export function statusFromEvaluations(evaluations: EvaluationForStatus[], isApprentice = false): ProbationStatus {
  if (isApprentice) return 'HIRED';
  const experiencia = evaluations
    .filter((e) => e.period !== 'FEEDBACK' && e.conclusion)
    .sort((a, b) => {
      const ordem = (p: string) => (p === 'SECOND' ? 1 : 0);
      return ordem(a.period) - ordem(b.period)
        || new Date(a.evaluationDate).getTime() - new Date(b.evaluationDate).getTime();
    });
  const ultima = experiencia[experiencia.length - 1];
  if (!ultima) return 'AWAITING_PERIOD_1';
  if (ultima.conclusion === 'DEMITIR') return 'TERMINATED';
  if (ultima.period === 'SECOND') return 'HIRED';
  return ultima.conclusion === 'EFETIVAR' ? 'HIRED' : 'AWAITING_PERIOD_2';
}
