import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ApiError } from './apiAuth';

/**
 * Reabertura de um treinamento encerrado em definitivo.
 *
 * Existe em dois portais — RH pelo /admin, Gestor Líder pelo /gestor — e a
 * regra é a mesma nos dois; o que muda é só quem pode chamar (permissão
 * `trainings.reopen`) e, no caso do Gestor Líder, o escopo do colaborador.
 * Por isso a lógica mora aqui, e não duplicada nas duas rotas.
 *
 * Reabrir devolve a ficha para "treinamento do dia": o tipo volta a aceitar
 * novas fichas para aquele colaborador. O par reopenedAt/reopenedById fica
 * como rastro de que aquele encerramento existiu e de quem o desfez — o
 * registro do treinamento em si não é apagado nem alterado no conteúdo.
 */
export async function reopenTraining({
  trainingId,
  adminId,
  assertAllowed,
}: {
  trainingId: string;
  adminId: string;
  /** Checagem extra de escopo, para quem não enxerga a operação inteira. */
  assertAllowed?: (employee: { id: string; unitId: string; sectorId: string; shift: 'DIA' | 'NOITE' }) => void;
}) {
  const training = await db.query.trainings.findFirst({
    where: eq(schema.trainings.id, trainingId),
    with: {
      employee: { columns: { id: true, fullName: true, unitId: true, sectorId: true, shift: true } },
      trainingType: { columns: { id: true, name: true } },
      trainer: { columns: { id: true, name: true } },
    },
  });
  if (!training) throw new ApiError(404, 'Treinamento não encontrado.');
  if (training.closure !== 'DEFINITIVO') {
    throw new ApiError(409, 'Este treinamento não está encerrado em definitivo.');
  }
  if (training.employee) assertAllowed?.(training.employee);

  const [row] = await db
    .update(schema.trainings)
    .set({ closure: 'DIA', reopenedAt: new Date(), reopenedById: adminId })
    .where(eq(schema.trainings.id, trainingId))
    .returning();

  return { training: row, employee: training.employee, trainingType: training.trainingType };
}
