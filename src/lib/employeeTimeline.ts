import { COLOR_LABELS, type FeedbackColor } from './feedbackCycle';
import { trainingResultLabel } from './trainingResult';

/**
 * Linha do tempo do colaborador: junta admissão, avaliações, mudanças de cor e
 * treinamentos numa lista só, ordenada do mais recente para o mais antigo.
 *
 * É lógica pura (nada de I/O, nada de React) porque é a parte fácil de errar:
 * a ordem, o rótulo do ciclo ("2º feedback") e quais mudanças de cor já estão
 * contadas dentro de uma avaliação. A tela só desenha o que sai daqui.
 */

export type TimelineKind = 'ADMISSAO' | 'AVALIACAO' | 'COR' | 'TREINAMENTO';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  date: Date;
  title: string;
  /** Quem fez — gestor que avaliou, treinador, quem mudou a cor. */
  author: string | null;
  /** Linha de apoio: conclusão, resultado, motivo da mudança. */
  detail: string | null;
  /** Cor envolvida no evento, quando houver, para o ponto colorido. */
  color: FeedbackColor | null;
}

export interface TimelineEvaluation {
  id: string;
  period: 'FIRST' | 'SECOND' | 'FEEDBACK';
  cycleNumber: number;
  evaluationDate: string | Date;
  classification: string;
  conclusion: string | null;
  color: FeedbackColor | null;
  evaluator: { name: string } | null;
}

export interface TimelineColorChange {
  id: string;
  createdAt: string | Date;
  previousColor: FeedbackColor | null;
  newColor: FeedbackColor;
  reason: string;
  /** Mudanças nascidas de uma avaliação já aparecem na própria avaliação. */
  evaluationId: string | null;
  changedBy: { name: string } | null;
}

export interface TimelineTraining {
  id: string;
  trainingDate: string | Date;
  result: string;
  closure: 'DIA' | 'DEFINITIVO';
  needsReinforcement: boolean;
  trainingType: { name: string } | null;
  trainer: { name: string } | null;
}

export const CLASSIFICATION_LABEL: Record<string, string> = {
  FRACO: 'Fraco',
  ALGUMAS_POSSIBILIDADES: 'Algumas possibilidades',
  OTIMAS_PERSPECTIVAS: 'Ótimas perspectivas',
  EXCELENTE_AQUISICAO: 'Excelente aquisição',
};

export const CONCLUSION_LABEL: Record<string, string> = {
  DEMITIR: 'Demitir',
  EFETIVAR: 'Efetivar',
  EXTENDER: 'Estender experiência',
};


/** Resultado de uma avaliação numa linha: classificação · conclusão. */
export function evaluationResult(ev: { classification: string; conclusion: string | null }): string {
  const partes = [CLASSIFICATION_LABEL[ev.classification] ?? ev.classification];
  if (ev.conclusion) partes.push(CONCLUSION_LABEL[ev.conclusion] ?? ev.conclusion);
  return partes.join(' · ');
}

export function evaluationTitle(period: TimelineEvaluation['period'], cycleNumber: number): string {
  if (period === 'FIRST') return 'Avaliação de 45 dias';
  if (period === 'SECOND') return 'Avaliação de 90 dias';
  return `${cycleNumber}º feedback`;
}

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));

export function buildEmployeeTimeline({
  admissionDate,
  evaluations = [],
  colorChanges = [],
  trainings = [],
}: {
  admissionDate: string | Date;
  evaluations?: TimelineEvaluation[];
  colorChanges?: TimelineColorChange[];
  trainings?: TimelineTraining[];
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: 'admissao',
    kind: 'ADMISSAO',
    date: toDate(admissionDate),
    title: 'Admissão',
    author: null,
    detail: null,
    color: null,
  });

  for (const ev of evaluations) {
    const partes = [CLASSIFICATION_LABEL[ev.classification] ?? ev.classification];
    if (ev.conclusion) partes.push(CONCLUSION_LABEL[ev.conclusion] ?? ev.conclusion);
    if (ev.color) partes.push(`Classificado como ${COLOR_LABELS[ev.color]}`);
    events.push({
      id: `ev-${ev.id}`,
      kind: 'AVALIACAO',
      date: toDate(ev.evaluationDate),
      title: evaluationTitle(ev.period, ev.cycleNumber),
      author: ev.evaluator?.name ?? null,
      detail: partes.join(' · '),
      color: ev.color,
    });
  }

  for (const ch of colorChanges) {
    // A cor definida DENTRO de uma avaliação já está descrita na linha da
    // avaliação; repeti-la aqui duplicaria o mesmo fato na linha do tempo.
    if (ch.evaluationId) continue;
    events.push({
      id: `cor-${ch.id}`,
      kind: 'COR',
      date: toDate(ch.createdAt),
      title: ch.previousColor
        ? `Cor alterada: ${COLOR_LABELS[ch.previousColor]} → ${COLOR_LABELS[ch.newColor]}`
        : `Classificado como ${COLOR_LABELS[ch.newColor]}`,
      author: ch.changedBy?.name ?? null,
      detail: ch.reason,
      color: ch.newColor,
    });
  }

  for (const tr of trainings) {
    const partes = [trainingResultLabel(tr.result, tr.closure)];
    if (tr.needsReinforcement) partes.push('Precisa de reforço');
    partes.push(tr.closure === 'DEFINITIVO' ? 'Encerrado em definitivo' : 'Treinamento do dia');
    events.push({
      id: `tr-${tr.id}`,
      kind: 'TREINAMENTO',
      date: toDate(tr.trainingDate),
      title: tr.trainingType?.name ?? 'Treinamento',
      author: tr.trainer?.name ?? null,
      detail: partes.join(' · '),
      color: null,
    });
  }

  // Mais recente primeiro. O desempate por id mantém a ordem estável quando
  // dois eventos caem no mesmo instante (ex.: avaliação e mudança de cor).
  return events.sort((a, b) => (b.date.getTime() - a.date.getTime()) || a.id.localeCompare(b.id));
}
