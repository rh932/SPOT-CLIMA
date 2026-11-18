import { COLOR_LABELS, feedbackOrdinalLabel, type FeedbackColor } from './feedbackCycle';
import { TERMINATION_LABELS, type TerminationReason } from './termination';
import { trainingResultLabel } from './trainingResult';

/**
 * Linha do tempo do colaborador: junta admissão, avaliações de experiência,
 * feedbacks, mudanças de cor, treinamentos e o desligamento numa lista só, em
 * ordem cronológica (do mais antigo ao mais recente), para acompanhar a jornada
 * desde a admissão.
 *
 * Experiência e feedback são etapas DIFERENTES e aparecem com nomes e tipos
 * diferentes: "Primeiro prazo de experiência (45 dias)" não é o "Primeiro
 * feedback". O feedback nunca leva o nome de admissão nem de experiência.
 *
 * É lógica pura (nada de I/O, nada de React) porque é a parte fácil de errar:
 * a ordem, o rótulo de cada etapa e quais mudanças de cor já estão contadas
 * dentro de uma avaliação. A tela só desenha o que sai daqui.
 */

export type TimelineKind = 'ADMISSAO' | 'EXPERIENCIA' | 'FEEDBACK' | 'COR' | 'TREINAMENTO' | 'DESLIGAMENTO';

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
  /** Próxima data prevista a partir deste evento (próximo prazo ou feedback). */
  nextDate: Date | null;
  /** Avaliação por trás do evento: a tela usa para abrir o registro completo. */
  evaluationId: string | null;
}

export interface TimelineEvaluation {
  id: string;
  period: 'FIRST' | 'SECOND' | 'FEEDBACK';
  cycleNumber: number;
  evaluationDate: string | Date;
  classification: string;
  conclusion: string | null;
  color: FeedbackColor | null;
  /** Data do próximo feedback que esta avaliação agendou (só quando há cor). */
  nextDueDate?: string | Date | null;
  evaluator: { name: string } | null;
  /** Quem avaliou fora do sistema (Forms) não tem conta: vem só o nome. */
  evaluatorName?: string | null;
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
  if (period === 'FIRST') return 'Primeiro prazo de experiência (45 dias)';
  if (period === 'SECOND') return 'Segundo prazo de experiência (mais 45 dias)';
  return feedbackOrdinalLabel(cycleNumber);
}

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));

/** Empate de data: a jornada segue a ordem natural das etapas. */
const KIND_RANK: Record<TimelineKind, number> = {
  ADMISSAO: 0, EXPERIENCIA: 1, FEEDBACK: 2, COR: 3, TREINAMENTO: 4, DESLIGAMENTO: 5,
};

export function buildEmployeeTimeline({
  admissionDate,
  period1DueDate,
  period2DueDate,
  evaluations = [],
  colorChanges = [],
  trainings = [],
  termination = null,
}: {
  admissionDate: string | Date;
  /** Fim do 1º prazo de experiência — a "próxima data" da admissão. */
  period1DueDate?: string | Date | null;
  /** Fim do 2º prazo — a próxima data de quem teve a experiência estendida. */
  period2DueDate?: string | Date | null;
  evaluations?: TimelineEvaluation[];
  colorChanges?: TimelineColorChange[];
  trainings?: TimelineTraining[];
  termination?: { date: string | Date | null; reason: string | null; notes?: string | null } | null;
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
    nextDate: period1DueDate ? toDate(period1DueDate) : null,
    evaluationId: null,
  });

  for (const ev of evaluations) {
    const partes = [CLASSIFICATION_LABEL[ev.classification] ?? ev.classification];
    if (ev.conclusion) partes.push(CONCLUSION_LABEL[ev.conclusion] ?? ev.conclusion);
    if (ev.color) partes.push(`Classificado como ${COLOR_LABELS[ev.color]}`);
    // Próxima data: no feedback, a que a cor agendou; no 1º prazo estendido,
    // o fim do 2º prazo. Nos demais casos a etapa se encerra ali.
    const nextDate = ev.nextDueDate
      ? toDate(ev.nextDueDate)
      : ev.period === 'FIRST' && ev.conclusion === 'EXTENDER' && period2DueDate
        ? toDate(period2DueDate)
        : null;
    // Setor com dois gestores: a 2ª resposta do mesmo prazo de experiência.
    const sufixo = ev.period !== 'FEEDBACK' && ev.cycleNumber > 1 ? ` (${ev.cycleNumber}ª resposta)` : '';
    events.push({
      id: `ev-${ev.id}`,
      kind: ev.period === 'FEEDBACK' ? 'FEEDBACK' : 'EXPERIENCIA',
      date: toDate(ev.evaluationDate),
      title: evaluationTitle(ev.period, ev.cycleNumber) + sufixo,
      author: ev.evaluator?.name ?? ev.evaluatorName ?? null,
      detail: partes.join(' · '),
      color: ev.color,
      nextDate,
      evaluationId: ev.id,
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
      nextDate: null,
      evaluationId: null,
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
      nextDate: null,
      evaluationId: null,
    });
  }

  // Desligamento: o fim da jornada. Sem data registrada (saída antiga, feita
  // pela avaliação "Demitir"), não há onde encaixá-lo na ordem: fica de fora.
  if (termination?.date) {
    const motivo = termination.reason
      ? (TERMINATION_LABELS[termination.reason as TerminationReason] ?? termination.reason)
      : null;
    events.push({
      id: 'saida',
      kind: 'DESLIGAMENTO',
      date: toDate(termination.date),
      title: 'Desligamento',
      author: null,
      detail: [motivo, termination.notes?.trim() || null].filter(Boolean).join(' · ') || null,
      color: null,
      nextDate: null,
      evaluationId: null,
    });
  }

  // Do mais antigo ao mais recente. No mesmo instante vale a ordem das etapas
  // (admissão, experiência, feedback...), e depois o id, para ficar estável.
  return events.sort((a, b) =>
    (a.date.getTime() - b.date.getTime()) || (KIND_RANK[a.kind] - KIND_RANK[b.kind]) || a.id.localeCompare(b.id));
}
