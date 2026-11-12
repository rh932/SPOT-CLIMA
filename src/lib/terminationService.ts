import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { ApiError } from '@/lib/apiAuth';
import { statusFromEvaluations } from '@/lib/termination';
import { saoPauloDay, utcDay } from '@/lib/probation';
import type { TerminationReason } from '@/lib/termination';

/**
 * Registrar e desfazer a saída de um colaborador — o mesmo para o RH (/admin)
 * e para o gestor (/gestor). As rotas cuidam de quem pode; aqui fica a regra.
 *
 * `podeAlcancar` é o escopo de quem chama: o RH alcança todos, o gestor só a
 * própria unidade/setor/turno. Recebe o cadastro antes de qualquer gravação.
 */

type Alvo = { unitId: string; sectorId: string; shift: 'DIA' | 'NOITE' };

export interface DadosDaSaida {
  reason: TerminationReason;
  /** ISO; a tela manda o meio-dia de São Paulo do dia escolhido. */
  date: string;
  notes?: string;
}

export async function registrarSaida(id: string, dados: DadosDaSaida, podeAlcancar: (e: Alvo) => boolean) {
  const existing = await db.query.probationaryEmployees.findFirst({
    where: eq(schema.probationaryEmployees.id, id),
    columns: { id: true, admissionDate: true, status: true, previousStatus: true, unitId: true, sectorId: true, shift: true },
  });
  if (!existing) throw new ApiError(404, 'Funcionário não encontrado.');
  if (!podeAlcancar(existing)) throw new ApiError(403, 'Este funcionário não está no seu escopo.');

  const date = new Date(dados.date);
  // Por dia de calendário: a tela manda o meio-dia de São Paulo, a admissão
  // é gravada como um instante qualquer do dia em UTC.
  if (saoPauloDay(date) < utcDay(existing.admissionDate)) {
    throw new ApiError(400, 'A data de saída não pode ser anterior à admissão.');
  }

  const [row] = await db
    .update(schema.probationaryEmployees)
    .set({
      status: 'TERMINATED',
      // O "desfazer" volta para cá. Corrigir motivo/data de quem já está
      // desligado não mexe no que foi guardado da primeira vez.
      previousStatus: existing.status === 'TERMINATED' ? existing.previousStatus : existing.status,
      terminationReason: dados.reason,
      terminationDate: date,
      terminationNotes: dados.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.probationaryEmployees.id, id))
    .returning();
  return row;
}

/**
 * Desfaz uma saída lançada por engano. A situação volta a ser a de antes do
 * registro (previousStatus). Sem ela — desligado que veio da importação —,
 * vale a que as avaliações dão; e se a última concluiu "Demitir", não há o
 * que desfazer: o desligamento veio da avaliação.
 */
export async function desfazerSaida(id: string, podeAlcancar: (e: Alvo) => boolean) {
  const existing = await db.query.probationaryEmployees.findFirst({
    where: eq(schema.probationaryEmployees.id, id),
    columns: { id: true, isApprentice: true, terminationReason: true, previousStatus: true, unitId: true, sectorId: true, shift: true },
    with: { evaluations: { columns: { period: true, conclusion: true, evaluationDate: true } } },
  });
  if (!existing) throw new ApiError(404, 'Funcionário não encontrado.');
  if (!podeAlcancar(existing)) throw new ApiError(403, 'Este funcionário não está no seu escopo.');
  if (!existing.terminationReason) {
    throw new ApiError(409, 'Não há saída registrada para desfazer.');
  }
  const status = existing.previousStatus ?? statusFromEvaluations(existing.evaluations, existing.isApprentice);
  if (status === 'TERMINATED') {
    throw new ApiError(409, 'A última avaliação concluiu "Demitir": o desligamento vem dela e não pode ser desfeito aqui.');
  }

  const [row] = await db
    .update(schema.probationaryEmployees)
    .set({
      status, previousStatus: null, terminationReason: null, terminationDate: null, terminationNotes: null, updatedAt: new Date(),
    })
    .where(eq(schema.probationaryEmployees.id, id))
    .returning();
  return row;
}

/** A saída pode ser desfeita? Mesma regra de `desfazerSaida`, para a tela esconder o botão. */
export function saidaPodeSerDesfeita(e: {
  terminationReason: string | null;
  previousStatus: string | null;
  isApprentice: boolean;
  evaluations: Parameters<typeof statusFromEvaluations>[0];
}): boolean {
  if (!e.terminationReason) return false;
  return Boolean(e.previousStatus) || statusFromEvaluations(e.evaluations, e.isApprentice) !== 'TERMINATED';
}
