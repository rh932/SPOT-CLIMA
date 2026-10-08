import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { deliverNotifications } from './notify';
import { saoPauloDay } from './probation';
import { errorForLog, errorSummary } from './dbErrors';

/**
 * Vigia da rotina diária de avisos (cron da Vercel, 14h UTC).
 *
 * Antes, se a rotina falhasse — ou simplesmente não rodasse — ninguém ficava
 * sabendo: os gestores paravam de receber lembrete e o atraso só aparecia
 * semanas depois. Agora:
 * - cada execução grava o resultado em system_settings (CRON_STATUS_KEY);
 * - uma falha manda alerta no sino e no celular de cada Super Admin;
 * - Configurações mostra a última execução e avisa se passou de um dia sem rodar.
 */

export const CRON_STATUS_KEY = 'cron.avisos.ultimaExecucao';
/** Roda uma vez por dia: mais de 26h sem execução quer dizer que pulou um dia. */
export const CRON_STALE_HOURS = 26;

export interface CronRun {
  at: string;
  ok: boolean;
  avaliados?: number;
  naJanela?: number;
  avisos?: number;
  /** Mensagem curta do erro — sem dado de funcionário. */
  erro?: string;
  /** Última execução que deu certo (repetida aqui para a tela mostrar mesmo depois de uma falha). */
  lastOkAt?: string | null;
}

export type CronHealth = 'OK' | 'FALHOU' | 'ATRASADA' | 'NUNCA_RODOU';

export function cronHealth(run: CronRun | null, now: Date = new Date()): CronHealth {
  if (!run) return 'NUNCA_RODOU';
  if (!run.ok) return 'FALHOU';
  const horas = (now.getTime() - new Date(run.at).getTime()) / 3_600_000;
  return horas > CRON_STALE_HOURS ? 'ATRASADA' : 'OK';
}

export async function getCronRun(): Promise<CronRun | null> {
  const row = await db.query.systemSettings.findFirst({ where: eq(schema.systemSettings.key, CRON_STATUS_KEY) });
  return (row?.value as CronRun | undefined) ?? null;
}

async function saveCronRun(run: CronRun): Promise<void> {
  await db
    .insert(schema.systemSettings)
    .values({ key: CRON_STATUS_KEY, value: run })
    .onConflictDoUpdate({ target: schema.systemSettings.key, set: { value: run, updatedAt: new Date() } });
}

export async function recordCronSuccess(info: { avaliados: number; naJanela: number; avisos: number }): Promise<void> {
  const at = new Date().toISOString();
  await saveCronRun({ at, ok: true, ...info, lastOkAt: at });
}

/**
 * Grava a falha e avisa os Super Admins. Nunca lança: o vigia não pode
 * derrubar a resposta da rotina (que já está falhando).
 */
export async function recordCronFailure(err: unknown): Promise<void> {
  // Resumo filtrado (src/lib/dbErrors.ts): a mensagem crua do Drizzle traz os
  // parâmetros da consulta — nomes de colaboradores, no caso desta rotina.
  const erro = errorSummary(err).replace(/\s+/g, ' ').slice(0, 200);
  try {
    const anterior = await getCronRun();
    await saveCronRun({ at: new Date().toISOString(), ok: false, erro, lastOkAt: anterior?.ok ? anterior.at : anterior?.lastOkAt ?? null });

    const superAdmins = await db.query.admins.findMany({
      where: eq(schema.admins.role, 'SUPER_ADMIN'),
      columns: { id: true, active: true },
    });
    const hoje = new Date(saoPauloDay());
    // Um alerta por dia: a Vercel pode tentar de novo, e o unique de
    // notifications não segura este caso (employeeId nulo nunca colide).
    const jaAvisados = new Set(
      (await db.query.notifications.findMany({
        where: and(eq(schema.notifications.type, 'SYSTEM_ALERT'), eq(schema.notifications.dueDate, hoje)),
        columns: { adminId: true },
      })).map((n) => n.adminId),
    );
    await deliverNotifications(
      superAdmins.filter((a) => a.active && !jaAvisados.has(a.id)).map((a) => ({
        adminId: a.id,
        type: 'SYSTEM_ALERT' as const,
        employeeId: null,
        dueDate: hoje,
        offsetDays: 0,
        message: 'A rotina diária de lembretes de avaliação falhou hoje. Os gestores podem não ter recebido os avisos. Veja em Configurações.',
      })),
    );
  } catch (e) {
    console.error('[cronStatus] não foi possível registrar a falha da rotina', errorForLog(e));
  }
}
