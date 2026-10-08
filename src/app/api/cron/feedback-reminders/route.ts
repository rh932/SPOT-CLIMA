export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buildReminderRows } from '@/lib/reminders';
import { deliverNotifications } from '@/lib/notify';
import { recordCronFailure, recordCronSuccess } from '@/lib/cronStatus';
import { errorForLog } from '@/lib/dbErrors';

/**
 * Rotina diária dos avisos de avaliação pendente.
 *
 * Cobre os dois prazos que o gestor tem que cumprir:
 * - experiência: avaliação de 45 dias (AWAITING_PERIOD_1) e de 90 dias
 *   (AWAITING_PERIOD_2);
 * - ciclo permanente de feedback de quem já foi efetivado.
 * Em cada um, avisa 7, 3 e 1 dia antes, no dia e depois de vencido (ver
 * REMINDER_OFFSETS).
 *
 * Roda pelo cron da Vercel, configurado em `vercel.json`. É idempotente por
 * construção: o unique de `notifications` (admin + tipo + funcionário + prazo +
 * antecedência) faz a segunda execução do mesmo dia não gerar nada, então
 * rodar de novo depois de uma falha é seguro. O caminho mantém o nome antigo
 * (`feedback-reminders`) para não mexer no agendamento já publicado.
 */
/** Comparação em tempo constante: `!==` termina no primeiro caractere diferente. */
function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET não configurado — a rotina de avisos está desligada.' },
      { status: 503 },
    );
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  let resultado: { avaliados: number; naJanela: number; entrega: Awaited<ReturnType<typeof deliverNotifications>> | null };
  try {
    // A regra de quem recebe e do texto mora em src/lib/reminders.ts, a mesma
    // do botão "Lembrar gestores agora" do RH.
    const { avaliados, naJanela, rows } = await buildReminderRows('rotina');
    const entrega = naJanela === 0 ? null : await deliverNotifications(rows);
    resultado = { avaliados, naJanela, entrega };
  } catch (err) {
    console.error('[cron feedback-reminders]', errorForLog(err));
    // Grava a falha e avisa os Super Admins (src/lib/cronStatus.ts).
    await recordCronFailure(err);
    return NextResponse.json({ error: 'Erro ao gerar os avisos.' }, { status: 500 });
  }

  // Fora do try da entrega: os avisos já saíram. Se só a gravação do status
  // falhar, isso não vira "rotina falhou" nem alerta para o Super Admin.
  const { avaliados, naJanela, entrega } = resultado;
  try {
    await recordCronSuccess({ avaliados, naJanela, avisos: entrega?.avisos ?? 0 });
  } catch (err) {
    console.error('[cron feedback-reminders] avisos entregues, mas o status não foi gravado', errorForLog(err));
  }
  // Quando ninguém está num dia de aviso, a rotina termina sem tocar em admins.
  if (!entrega) return NextResponse.json({ ok: true, avaliados, avisos: 0 });
  return NextResponse.json({ ok: true, avaliados, naJanela, ...entrega });
}
