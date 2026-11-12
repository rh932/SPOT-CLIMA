/**
 * Quem já recebeu feedback e quem ainda deve — lógica pura.
 * "Recebeu" = tem ao menos uma avaliação do período FEEDBACK. A avaliação de
 * experiência não conta: o feedback é um processo à parte.
 */

export interface FeedbackAcompanhado {
  nextFeedbackDueDate: string | null;
  evaluations?: { period: 'FIRST' | 'SECOND' | 'FEEDBACK'; evaluationDate: string }[];
}

export interface ResumoFeedback {
  /** Participantes do ciclo de feedback. */
  total: number;
  /** Feedback com prazo vencido (hoje ou antes). */
  vencidos: number;
  /** Nunca receberam nenhum feedback. */
  nuncaReceberam: number;
  /** Receberam feedback no mês corrente. */
  noMes: number;
}

export function jaRecebeuFeedback(e: FeedbackAcompanhado): boolean {
  return (e.evaluations ?? []).some((ev) => ev.period === 'FEEDBACK');
}

export function resumoFeedback(lista: FeedbackAcompanhado[], now: Date = new Date()): ResumoFeedback {
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const proximoMes = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  let vencidos = 0;
  let nuncaReceberam = 0;
  let noMes = 0;
  for (const e of lista) {
    if (e.nextFeedbackDueDate) {
      const d = new Date(e.nextFeedbackDueDate);
      if (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() <= hoje) vencidos += 1;
    }
    if (!jaRecebeuFeedback(e)) nuncaReceberam += 1;
    const recebeuNoMes = (e.evaluations ?? []).some((ev) => {
      if (ev.period !== 'FEEDBACK') return false;
      const t = new Date(ev.evaluationDate).getTime();
      return t >= inicioMes && t < proximoMes;
    });
    if (recebeuNoMes) noMes += 1;
  }
  return { total: lista.length, vencidos, nuncaReceberam, noMes };
}
