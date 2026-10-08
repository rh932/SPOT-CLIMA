import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { daysBetween, dueReminderOffset, reminderMessage } from './feedbackCycle';
import { notificationTargets } from './notificationTargets';
import { loadNotifiableAdmins, type NotificationRow } from './notify';
import { awaitsSecondEvaluation } from './colorUnlock';

/**
 * Lembretes de avaliação pendente — a regra que a rotina diária e o botão
 * "Lembrar gestores agora" do RH compartilham.
 *
 * - `rotina`: só quem está num dos dias de aviso (7, 3, 1, 0, -1, -7);
 * - `agora`: tudo o que está atrasado ou vence em até JANELA_AGORA dias.
 *
 * Nos dois, o destinatário é o mesmo (gestor do turno e Gestor Líder do
 * escopo) e o `offsetDays` é a distância real até o prazo. Com o unique de
 * `notifications`, apertar o botão duas vezes no mesmo dia não repete nada.
 */

export const JANELA_AGORA = 7;

export interface ReminderPlan {
  /** Colaboradores com prazo em aberto olhados. */
  avaliados: number;
  /** Quantos deles entram neste envio. */
  naJanela: number;
  /** Desses, quantos não têm gestor com conta ativa no escopo (ninguém recebe). */
  semGestor: number;
  rows: NotificationRow[];
}

export async function buildReminderRows(mode: 'rotina' | 'agora', now: Date = new Date()): Promise<ReminderPlan> {
  const columns = {
    id: true, fullName: true, unitId: true, sectorId: true, shift: true,
    status: true, period1DueDate: true, period2DueDate: true, nextFeedbackDueDate: true,
  } as const;

  const [emExperiencia, todosHired, efetivadosSemCor] = await Promise.all([
    db.query.probationaryEmployees.findMany({
      // Aprendiz não tem experiência de 45/90 — nunca recebe esse lembrete.
      where: and(
        inArray(schema.probationaryEmployees.status, ['AWAITING_PERIOD_1', 'AWAITING_PERIOD_2']),
        eq(schema.probationaryEmployees.isApprentice, false),
      ),
      columns,
    }),
    // Ciclo permanente: efetivado, com próxima data marcada E num setor que
    // participa do projeto de cores. O filtro do setor não é redundante:
    // existem colaboradores efetivados com cor de antes de o ciclo virar
    // exclusividade do Salão. Sem ele, o gestor receberia lembrete de um
    // feedback que a rota de avaliação recusa — um aviso impossível de atender.
    db.query.probationaryEmployees.findMany({
      where: and(
        eq(schema.probationaryEmployees.status, 'HIRED'),
        eq(schema.probationaryEmployees.isApprentice, false),
        isNotNull(schema.probationaryEmployees.nextFeedbackDueDate),
      ),
      columns,
      with: { sector: { columns: { usesColorCycle: true } } },
    }),
    // Efetivado na 1ª avaliação num setor de cores: a 2ª avaliação de
    // experiência continua devida (colorUnlock.ts) e é lembrada como "de 90 dias".
    db.query.probationaryEmployees.findMany({
      where: and(
        eq(schema.probationaryEmployees.status, 'HIRED'),
        eq(schema.probationaryEmployees.isApprentice, false),
        isNull(schema.probationaryEmployees.currentColor),
      ),
      columns,
      with: {
        sector: { columns: { usesColorCycle: true } },
        evaluations: { columns: { period: true } },
      },
    }),
  ]);
  const noCiclo = todosHired.filter((e) => e.sector?.usesColorCycle);
  const faltaSegunda = efetivadosSemCor.filter((e) => awaitsSecondEvaluation({
    status: e.status, isApprentice: false, currentColor: null,
    usesColorCycle: Boolean(e.sector?.usesColorCycle), evaluations: e.evaluations,
  }));

  const candidatos = [
    ...emExperiencia.map((employee) => {
      const primeiro = employee.status === 'AWAITING_PERIOD_1';
      return {
        employee,
        type: 'EVALUATION_REMINDER' as const,
        dueDate: primeiro ? employee.period1DueDate : employee.period2DueDate,
        kind: primeiro ? 'de 45 dias' : 'de 90 dias',
      };
    }),
    ...faltaSegunda.map((employee) => ({
      employee,
      type: 'EVALUATION_REMINDER' as const,
      dueDate: employee.period2DueDate,
      kind: 'de 90 dias',
    })),
    ...noCiclo.map((employee) => ({
      employee,
      type: 'FEEDBACK_REMINDER' as const,
      dueDate: employee.nextFeedbackDueDate!,
      kind: 'de feedback',
    })),
  ];

  const pendentes = candidatos
    .map((c) => {
      const offset = mode === 'rotina'
        ? dueReminderOffset(c.dueDate, now)
        : (() => { const d = daysBetween(now, c.dueDate); return d <= JANELA_AGORA ? d : null; })();
      return { ...c, offset };
    })
    .filter((c): c is typeof c & { offset: number } => c.offset !== null);

  if (pendentes.length === 0) return { avaliados: candidatos.length, naJanela: 0, semGestor: 0, rows: [] };

  const admins = await loadNotifiableAdmins();
  let semGestor = 0;
  // Destinatários: gestor do turno e Gestor Líder do escopo — o RH não recebe
  // lembrete, ele acompanha pelo painel (ver notificationTargets).
  const rows: NotificationRow[] = pendentes.flatMap(({ employee, type, dueDate, offset, kind }) => {
    const alvos = notificationTargets(admins, employee);
    if (alvos.length === 0) semGestor += 1;
    return alvos.map((admin) => ({
      adminId: admin.id,
      type,
      employeeId: employee.id,
      dueDate,
      offsetDays: offset,
      message: reminderMessage(employee.fullName, offset, kind),
    }));
  });

  return { avaliados: candidatos.length, naJanela: pendentes.length, semGestor, rows };
}
