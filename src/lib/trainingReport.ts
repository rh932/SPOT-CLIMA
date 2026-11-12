/**
 * Agregação dos treinamentos para o relatório do admin.
 *
 * Lógica pura: recebe os registros já carregados e devolve os números. Sem
 * I/O, para ficar testável e poder alimentar tanto a tela quanto o export.
 *
 * Cuidado com a régua: o formulário do bar usa "Não" como quarta opção, que
 * NÃO é uma nota melhor que "Bom" — é outra coisa. Por isso o cálculo de
 * média só considera RUIM/MEDIO/BOM/OTIMO e conta os "Não" à parte.
 */

import { trainingResultLabel, type TrainingClosure } from './trainingResult';

export type TrainingRating = 'RUIM' | 'MEDIO' | 'BOM' | 'OTIMO' | 'NAO';

/** Peso só para as notas que formam uma escala de pior a melhor. */
const RATING_SCORE: Partial<Record<TrainingRating, number>> = {
  RUIM: 1,
  MEDIO: 2,
  BOM: 3,
  OTIMO: 4,
};

export interface TrainingRecordInput {
  id: string;
  trainingDate: string | Date;
  result: string;
  needsReinforcement: boolean;
  closure?: TrainingClosure;
  employee: { id: string; fullName: string } | null;
  trainingType: { id: string; name: string } | null;
  trainer: { id: string; name: string } | null;
  answers: { rating: TrainingRating; criterion: { id: string; label: string } | null }[];
}

export interface CriterionStat {
  criterionId: string;
  label: string;
  /** Média de 1 a 4; null quando só houve respostas "Não". */
  average: number | null;
  answered: number;
  naoCount: number;
  ruimCount: number;
}

export interface TrainingTypeStat {
  typeId: string;
  name: string;
  total: number;
  reinforcement: number;
  approved: number;
  rejected: number;
}

export interface TrainerStat {
  trainerId: string;
  name: string;
  total: number;
  reinforcement: number;
}

export interface TrainingReport {
  total: number;
  reinforcement: number;
  approved: number;
  approvedWithNote: number;
  rejected: number;
  byType: TrainingTypeStat[];
  byTrainer: TrainerStat[];
  /** Critérios ordenados do pior para o melhor — onde a operação mais falha. */
  weakestCriteria: CriterionStat[];
  employeesNeedingReinforcement: { employeeId: string; fullName: string; count: number }[];
}

export function buildTrainingReport(records: TrainingRecordInput[]): TrainingReport {
  const byType = new Map<string, TrainingTypeStat>();
  const byTrainer = new Map<string, TrainerStat>();
  const byCriterion = new Map<string, { label: string; sum: number; scored: number; nao: number; ruim: number }>();
  const reinforcementByEmployee = new Map<string, { fullName: string; count: number }>();

  for (const r of records) {
    if (r.trainingType) {
      const t = byType.get(r.trainingType.id)
        ?? { typeId: r.trainingType.id, name: r.trainingType.name, total: 0, reinforcement: 0, approved: 0, rejected: 0 };
      t.total++;
      if (r.needsReinforcement) t.reinforcement++;
      if (r.result === 'APROVADO') t.approved++;
      if (r.result === 'REPROVADO') t.rejected++;
      byType.set(r.trainingType.id, t);
    }

    if (r.trainer) {
      const t = byTrainer.get(r.trainer.id) ?? { trainerId: r.trainer.id, name: r.trainer.name, total: 0, reinforcement: 0 };
      t.total++;
      if (r.needsReinforcement) t.reinforcement++;
      byTrainer.set(r.trainer.id, t);
    }

    if (r.needsReinforcement && r.employee) {
      const e = reinforcementByEmployee.get(r.employee.id) ?? { fullName: r.employee.fullName, count: 0 };
      e.count++;
      reinforcementByEmployee.set(r.employee.id, e);
    }

    for (const a of r.answers) {
      if (!a.criterion) continue;
      const c = byCriterion.get(a.criterion.id)
        ?? { label: a.criterion.label, sum: 0, scored: 0, nao: 0, ruim: 0 };
      const score = RATING_SCORE[a.rating];
      if (score !== undefined) {
        c.sum += score;
        c.scored++;
        if (a.rating === 'RUIM') c.ruim++;
      } else {
        c.nao++;
      }
      byCriterion.set(a.criterion.id, c);
    }
  }

  const weakestCriteria: CriterionStat[] = [...byCriterion.entries()]
    .map(([criterionId, c]) => ({
      criterionId,
      label: c.label,
      average: c.scored > 0 ? Number((c.sum / c.scored).toFixed(2)) : null,
      answered: c.scored + c.nao,
      naoCount: c.nao,
      ruimCount: c.ruim,
    }))
    // Sem média (só "Não") vai para o fim: não dá para dizer que é o pior.
    .sort((a, b) => (a.average ?? 99) - (b.average ?? 99));

  return {
    total: records.length,
    reinforcement: records.filter((r) => r.needsReinforcement).length,
    approved: records.filter((r) => r.result === 'APROVADO').length,
    approvedWithNote: records.filter((r) => r.result === 'APROVADO_COM_RESSALVA').length,
    rejected: records.filter((r) => r.result === 'REPROVADO').length,
    byType: [...byType.values()].sort((a, b) => b.total - a.total),
    byTrainer: [...byTrainer.values()].sort((a, b) => b.total - a.total),
    weakestCriteria,
    employeesNeedingReinforcement: [...reinforcementByEmployee.entries()]
      .map(([employeeId, e]) => ({ employeeId, fullName: e.fullName, count: e.count }))
      .sort((a, b) => b.count - a.count),
  };
}


const RATING_LABEL: Record<string, string> = {
  RUIM: 'Ruim', MEDIO: 'Médio', BOM: 'Bom', OTIMO: 'Ótimo', NAO: 'Não',
};

/**
 * Célula de CSV. Texto que começa com = + - @ (ou tab/CR) é lido como fórmula
 * pelo Excel: o nome de um colaborador cadastrado como `=HYPERLINK(...)` virava
 * um link (ou um comando) na planilha do RH. O apóstrofo na frente desliga isso.
 */
export function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com uma linha por treinamento — o formato que abre direto no Excel. */
export function buildTrainingsCsv(records: TrainingRecordInput[]): string {
  const header = ['Data', 'Colaborador', 'Treinamento', 'Treinador', 'Resultado', 'Precisa de reforço', 'Itens avaliados'];
  const linhas = records.map((r) => [
    new Date(r.trainingDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
    r.employee?.fullName ?? '',
    r.trainingType?.name ?? '',
    r.trainer?.name ?? '',
    trainingResultLabel(r.result, r.closure),
    r.needsReinforcement ? 'Sim' : 'Não',
    r.answers
      .filter((a) => a.criterion)
      .map((a) => `${a.criterion!.label}: ${RATING_LABEL[a.rating] ?? a.rating}`)
      .join(' | '),
  ]);
  return [header, ...linhas].map((l) => l.map(csvCell).join(';')).join('\n');
}
