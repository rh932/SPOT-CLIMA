/**
 * Perguntas extras dos questionários por setor — lógica pura (sem banco).
 *
 * O formulário padrão (4 dimensões da experiência, roteiro PDI, uniforme) é fixo no
 * código. O PJ de um setor acrescenta perguntas ao final dele; elas só chegam a quem
 * avalia depois que o RH aprova. Este arquivo define o ciclo de vida, quem pode fazer
 * cada passo e como as respostas são conferidas e guardadas.
 */

export type QuestionForm = 'DESEMPENHO' | 'FEEDBACK';
export type QuestionType = 'NOTA' | 'SIM_NAO' | 'TEXTO';
export type QuestionStatus = 'RASCUNHO' | 'EM_ANALISE' | 'APROVADA' | 'REPROVADA' | 'ARQUIVADA';
export type QuestionAction = 'SUBMIT' | 'WITHDRAW' | 'APPROVE' | 'REJECT' | 'ARCHIVE';

export const FORM_LABEL: Record<QuestionForm, string> = {
  DESEMPENHO: 'Avaliação de desempenho (45/90 dias)',
  FEEDBACK: 'Feedback',
};
export const TYPE_LABEL: Record<QuestionType, string> = {
  NOTA: 'Nota (Ótimo, Bom, Regular, Ruim)',
  SIM_NAO: 'Sim ou não',
  TEXTO: 'Resposta escrita',
};
export const STATUS_LABEL: Record<QuestionStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_ANALISE: 'Aguardando o RH',
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
  ARQUIVADA: 'Arquivada',
};

export const NOTA_OPCOES = [
  { value: 'OTIMO', label: 'Ótimo' },
  { value: 'BOM', label: 'Bom' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'RUIM', label: 'Ruim' },
] as const;
export const SIM_NAO_OPCOES = [
  { value: 'SIM', label: 'Sim' },
  { value: 'NAO', label: 'Não' },
] as const;

/** Qual formulário a avaliação usa: 45/90 dias é desempenho; o ciclo permanente é feedback. */
export function formForPeriod(period: 'FIRST' | 'SECOND' | 'FEEDBACK'): QuestionForm {
  return period === 'FEEDBACK' ? 'FEEDBACK' : 'DESEMPENHO';
}

/** Perguntas que aparecem para quem avalia: só as aprovadas, na ordem. */
export function liveQuestions<T extends { status: QuestionStatus; order: number; createdAt?: Date | string }>(questions: T[]): T[] {
  return questions
    .filter((q) => q.status === 'APROVADA')
    .sort((a, b) => a.order - b.order || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
}

/**
 * Transições permitidas. O PJ mexe só no que é dele (rascunho, reprovada, e retirar o
 * que enviou); aprovar, reprovar e arquivar é do RH. Mexer numa APROVADA a manda de volta
 * para o RH (ver `editReset`), então ela nunca vai ao ar alterada sem ser vista.
 */
const TRANSITIONS: Record<QuestionAction, { from: QuestionStatus[]; to: QuestionStatus; reviewer: boolean }> = {
  SUBMIT: { from: ['RASCUNHO', 'REPROVADA'], to: 'EM_ANALISE', reviewer: false },
  WITHDRAW: { from: ['EM_ANALISE'], to: 'RASCUNHO', reviewer: false },
  APPROVE: { from: ['EM_ANALISE', 'REPROVADA'], to: 'APROVADA', reviewer: true },
  REJECT: { from: ['EM_ANALISE', 'APROVADA'], to: 'REPROVADA', reviewer: true },
  ARCHIVE: { from: ['RASCUNHO', 'EM_ANALISE', 'APROVADA', 'REPROVADA'], to: 'ARQUIVADA', reviewer: false },
};

export function applyAction(
  from: QuestionStatus, action: QuestionAction, who: { isReviewer: boolean },
): { ok: true; to: QuestionStatus } | { ok: false; error: string } {
  const t = TRANSITIONS[action];
  if (t.reviewer && !who.isReviewer) return { ok: false, error: 'Só o RH decide se a pergunta vai ao ar.' };
  // Arquivar uma pergunta que já foi ao ar (ou está com o RH) é do RH: ela some do formulário.
  if (action === 'ARCHIVE' && !who.isReviewer && (from === 'APROVADA' || from === 'EM_ANALISE')) {
    return { ok: false, error: 'Esta pergunta já foi enviada ao RH. Peça ao RH para arquivar.' };
  }
  if (!t.from.includes(from)) return { ok: false, error: `Uma pergunta "${STATUS_LABEL[from].toLowerCase()}" não aceita esta ação.` };
  return { ok: true, to: t.to };
}

/** Editar texto/tipo/obrigatoriedade: pergunta aprovada ou reprovada volta para análise. */
export function statusAfterEdit(from: QuestionStatus, changedContent: boolean, who: { isReviewer: boolean }): QuestionStatus {
  if (!changedContent) return from;
  if (from === 'APROVADA') return who.isReviewer ? 'APROVADA' : 'EM_ANALISE';
  if (from === 'REPROVADA') return 'RASCUNHO';
  return from;
}

export function canEditQuestion(status: QuestionStatus, who: { isReviewer: boolean }): boolean {
  if (status === 'ARQUIVADA') return false;
  if (who.isReviewer) return true;
  // O PJ não edita o que está na mesa do RH; se quiser mudar, retira primeiro.
  return status !== 'EM_ANALISE';
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

export interface AnsweredQuestion {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  /** Resposta no momento da avaliação (OTIMO.., SIM/NAO ou o texto escrito). Vazia se opcional e pulada. */
  value: string;
}

interface QuestionLike { id: string; text: string; type: QuestionType; required: boolean }

/**
 * Confere as respostas contra as perguntas aprovadas daquele setor/formulário e devolve o
 * que será gravado — com o TEXTO da pergunta junto (snapshot). Respostas para perguntas
 * que não estão no ar são recusadas: quem decide o que vale é o servidor, não o cliente.
 */
export function validateCustomAnswers(
  questions: QuestionLike[], answers: Record<string, string> | undefined | null,
): { ok: true; answered: AnsweredQuestion[] } | { ok: false; error: string; missingIds: string[] } {
  const given = answers ?? {};
  const known = new Set(questions.map((q) => q.id));
  const unknown = Object.keys(given).filter((k) => !known.has(k) && String(given[k] ?? '').trim() !== '');
  if (unknown.length > 0) {
    return { ok: false, error: 'Há resposta para uma pergunta que não está mais no formulário. Recarregue a página.', missingIds: [] };
  }
  const missing: string[] = [];
  const answered: AnsweredQuestion[] = [];
  for (const q of questions) {
    const value = String(given[q.id] ?? '').trim();
    const validValue = q.type === 'NOTA' ? NOTA_OPCOES.some((o) => o.value === value)
      : q.type === 'SIM_NAO' ? SIM_NAO_OPCOES.some((o) => o.value === value)
        : value.length > 0;
    if (!validValue) {
      // Opcional e em branco: segue. Obrigatória, ou preenchida com valor inválido: falta.
      if (q.required || value !== '') missing.push(q.id);
      continue;
    }
    answered.push({ id: q.id, text: q.text, type: q.type, required: q.required, value });
  }
  if (missing.length > 0) {
    return { ok: false, error: 'Responda todas as perguntas obrigatórias do setor.', missingIds: missing };
  }
  return { ok: true, answered };
}

/** Rótulo legível de uma resposta guardada (para a ficha e o histórico). */
export function answerLabel(a: Pick<AnsweredQuestion, 'type' | 'value'>): string {
  if (!a.value) return '—';
  if (a.type === 'NOTA') return NOTA_OPCOES.find((o) => o.value === a.value)?.label ?? a.value;
  if (a.type === 'SIM_NAO') return SIM_NAO_OPCOES.find((o) => o.value === a.value)?.label ?? a.value;
  return a.value;
}
