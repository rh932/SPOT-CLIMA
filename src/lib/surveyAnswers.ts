/**
 * Respostas da pesquisa de clima: o que conta como resposta válida e quem
 * conta como PESSOA num recorte.
 *
 * As duas regras andam juntas porque a proteção de anonimato depende delas.
 * O limite mínimo (src/lib/anonymity.ts) só protege alguém se contar pessoas
 * que de fato deram nota — se um envio sem nota nenhuma contasse, bastaria
 * mandar alguns envios vazios para um setor de uma pessoa só para liberar o
 * resultado dele, e a média exibida seria a nota daquela pessoa.
 *
 * Módulo puro (sem banco): a rota pública e o cálculo de resultados usam as
 * mesmas funções, e os testes exercitam as regras sem Postgres.
 */

export interface QuestionForValidation {
  id: string;
  type: string;
  required: boolean;
  scaleMin: number | null;
  scaleMax: number | null;
  options: { label: string }[];
}

export interface SubmittedAnswer {
  questionId: string;
  numericValue?: number;
  textValue?: string;
  choiceValues?: string[];
}

export interface ValidAnswer {
  questionId: string;
  numericValue?: number;
  textValue?: string;
  choiceValues?: string[];
}

/** Resposta válida para a pergunta, já normalizada — ou null se não vale. */
function validAnswerFor(question: QuestionForValidation, a: SubmittedAnswer): ValidAnswer | null {
  if (question.type === 'LIKERT') {
    if (a.numericValue === undefined || a.numericValue < 1 || a.numericValue > 5) return null;
    return { questionId: question.id, numericValue: a.numericValue };
  }
  if (question.type === 'SCALE') {
    if (
      a.numericValue === undefined ||
      question.scaleMin === null ||
      question.scaleMax === null ||
      a.numericValue < question.scaleMin ||
      a.numericValue > question.scaleMax
    ) {
      return null;
    }
    return { questionId: question.id, numericValue: a.numericValue };
  }
  if (question.type === 'YES_NO') {
    if (!a.choiceValues || a.choiceValues.length !== 1 || (a.choiceValues[0] !== 'Sim' && a.choiceValues[0] !== 'Não')) return null;
    return { questionId: question.id, choiceValues: a.choiceValues };
  }
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    if (!a.choiceValues || a.choiceValues.length === 0) return null;
    const allowed = new Set(question.options.map((o) => o.label));
    const chosen = Array.from(new Set(a.choiceValues));
    if (!chosen.every((c) => allowed.has(c))) return null;
    if (question.type === 'SINGLE_CHOICE' && chosen.length !== 1) return null;
    return { questionId: question.id, choiceValues: chosen };
  }
  if (!a.textValue || a.textValue.trim().length === 0) return null;
  return { questionId: question.id, textValue: a.textValue.trim() };
}

/**
 * Confere um envio contra as perguntas ativas da pesquisa.
 *
 * - Resposta para pergunta de outra pesquisa ou inativa é ignorada.
 * - Uma resposta por pergunta: repetir o mesmo questionId multiplicaria o
 *   peso do voto, então só a primeira vale.
 * - Obrigatória é conferida pela resposta VÁLIDA, não pela presença do id:
 *   mandar a pergunta com um valor fora da faixa não a torna respondida.
 */
export function validateAnswers(
  questions: QuestionForValidation[],
  submitted: SubmittedAnswer[],
): { rows: ValidAnswer[]; missingRequired: string[] } {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const rows: ValidAnswer[] = [];
  const seen = new Set<string>();

  for (const a of submitted) {
    const question = questionById.get(a.questionId);
    if (!question || seen.has(question.id)) continue;
    seen.add(question.id);
    const valid = validAnswerFor(question, a);
    if (valid) rows.push(valid);
  }

  const answered = new Set(rows.map((r) => r.questionId));
  const missingRequired = questions.filter((q) => q.required && !answered.has(q.id)).map((q) => q.id);
  return { rows, missingRequired };
}

/**
 * Notas Likert de um recorte (setor, unidade) e quantas PESSOAS distintas
 * contribuíram para elas. É esse número que a regra de anonimato tem que
 * olhar — não quantos envios o recorte tem: quem só respondeu perguntas
 * abertas, ou um envio sem nenhuma nota, não entra na média exibida e não
 * pode contar como proteção de quem entrou.
 */
export function likertValues(
  answers: { responseId: string; questionId: string; numericValue: number | null }[],
  questionTypeById: Map<string, { type: string }>,
  responseIds: Set<string>,
): { values: number[]; respondents: number } {
  const values: number[] = [];
  const respondents = new Set<string>();
  for (const a of answers) {
    if (!responseIds.has(a.responseId) || a.numericValue === null) continue;
    if (questionTypeById.get(a.questionId)?.type !== 'LIKERT') continue;
    values.push(a.numericValue);
    respondents.add(a.responseId);
  }
  return { values, respondents: respondents.size };
}
