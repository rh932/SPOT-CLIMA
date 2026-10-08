import { db } from '@/db';
import * as schema from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { ApiError } from './apiAuth';
import { colorChangeBaseDate, nextFeedbackDate, type FeedbackColor } from './feedbackCycle';
import { colorUnlocked, COR_BLOQUEADA_MSG } from './colorUnlock';

/**
 * Mudança da classificação por cor fora do fluxo de avaliação.
 *
 * Acontece em dois portais — RH pelo /admin e Gestor/Gestor Líder pelo
 * /gestor — com regra idêntica; o que muda é só quem pode chamar e, na
 * operação, o escopo do colaborador. Por isso a lógica mora aqui: se a regra
 * de recálculo do prazo ficasse duplicada, um lado divergiria do outro na
 * primeira manutenção.
 *
 * O recálculo segue `colorChangeBaseDate()`: primeira classificação conta de
 * hoje, mudança de cor conta da última avaliação — mudar a cor ajusta a
 * cadência, nunca zera o relógio de quem está atrasado.
 */
export async function changeEmployeeColor({
  employeeId,
  color,
  reason,
  adminId,
  origem,
  assertAllowed,
}: {
  employeeId: string;
  color: FeedbackColor;
  reason: string;
  adminId: string;
  /** Só para a auditoria: de qual portal veio a mudança. */
  origem: 'admin' | 'gestor';
  /** Checagem extra de escopo, para quem não enxerga a operação inteira. */
  assertAllowed?: (employee: { id: string; unitId: string; sectorId: string; shift: 'DIA' | 'NOITE' }) => void;
}) {
  const employee = await db.query.probationaryEmployees.findFirst({
    where: eq(schema.probationaryEmployees.id, employeeId),
    with: { sector: { columns: { name: true, usesColorCycle: true } } },
  });
  if (!employee) throw new ApiError(404, 'Colaborador não encontrado.');
  assertAllowed?.(employee);

  if (employee.status !== 'HIRED') {
    throw new ApiError(409, 'A classificação por cor só vale para colaboradores efetivados.');
  }
  if (employee.isApprentice) {
    throw new ApiError(409, 'Jovem aprendiz não entra no ciclo de feedback por cores.');
  }
  // O projeto de cores é do Salão: classificar quem está fora dele criaria uma
  // data de feedback que ninguém acompanha.
  if (!employee.sector?.usesColorCycle) {
    throw new ApiError(
      409,
      `O setor ${employee.sector?.name ?? 'deste colaborador'} não participa do projeto de cores.`,
    );
  }
  // A cor só é liberada depois da 2ª avaliação de experiência — regra
  // individual, lida do histórico deste colaborador (ver colorUnlock.ts).
  const periodos = await db
    .select({ period: schema.performanceEvaluations.period })
    .from(schema.performanceEvaluations)
    .where(eq(schema.performanceEvaluations.employeeId, employee.id));
  if (!colorUnlocked({ currentColor: employee.currentColor, evaluations: periodos })) {
    throw new ApiError(409, COR_BLOQUEADA_MSG);
  }
  if (color === employee.currentColor) {
    throw new ApiError(400, 'Esta já é a classificação atual do colaborador.');
  }

  const [lastEvaluation] = await db
    .select({ evaluationDate: schema.performanceEvaluations.evaluationDate })
    .from(schema.performanceEvaluations)
    .where(eq(schema.performanceEvaluations.employeeId, employee.id))
    .orderBy(desc(schema.performanceEvaluations.evaluationDate))
    .limit(1);

  const base = colorChangeBaseDate({
    currentColor: employee.currentColor,
    lastEvaluationDate: lastEvaluation?.evaluationDate ?? null,
  });
  const nextDueDate = nextFeedbackDate(base, color);

  await db
    .update(schema.probationaryEmployees)
    .set({ currentColor: color, nextFeedbackDueDate: nextDueDate, updatedAt: new Date() })
    .where(eq(schema.probationaryEmployees.id, employee.id));

  // Sem evaluationId: esta mudança não nasceu de uma avaliação.
  const [change] = await db
    .insert(schema.employeeColorChanges)
    .values({
      employeeId: employee.id,
      previousColor: employee.currentColor,
      newColor: color,
      reason: reason.trim(),
      nextDueDate,
      changedByAdminId: adminId,
    })
    .returning();

  return { change, employee, nextDueDate, previousColor: employee.currentColor, origem };
}
