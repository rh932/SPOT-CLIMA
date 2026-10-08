import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { hashAccessCode, isAccessCodeFormat } from '@/lib/accessCodes';
import { consumeRateLimit, isRateLimited } from '@/lib/rateLimit';
import { clientIp } from '@/lib/clientIp';
import { saoPauloDay } from '@/lib/probation';
import { createSurveyTicket, TICKET_HOURS } from '@/lib/surveyTicket';
import { errorForLog } from '@/lib/dbErrors';

const CODIGO_INVALIDO = 'Código de participação inválido ou já usado. Confira o papel que você recebeu.';
const MUITOS = 'Muitos códigos errados em pouco tempo. Tente de novo daqui a alguns minutos.';
/** Erros por IP. No restaurante o Wi-Fi é um IP só: conta só o erro, não quem acerta. */
const TETO_ERROS = 30;
const JANELA = 10 * 60 * 1000;

const bodySchema = z.object({
  surveyId: z.string().min(1).max(64),
  accessCode: z.string().trim().max(20),
});

/**
 * Troca o código de participação por um bilhete de resposta (src/lib/surveyTicket.ts).
 *
 * Acontece ao COMEÇAR a pesquisa, numa transação separada da resposta: é o
 * que impede ligar o papel à resposta pelo banco. O código é gasto aqui —
 * se a pessoa fechar o navegador antes de enviar, o bilhete fica guardado na
 * aba (sessionStorage) e vale por algumas horas.
 *
 * Nada aqui grava IP, horário ou o código em claro; o uso fica só com o dia.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (await isRateLimited('pesquisa-codigo', ip, TETO_ERROS)) {
    return NextResponse.json({ error: MUITOS }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isAccessCodeFormat(parsed.data.accessCode)) {
    await consumeRateLimit('pesquisa-codigo', ip, TETO_ERROS, JANELA);
    return NextResponse.json({ error: CODIGO_INVALIDO }, { status: 400 });
  }

  try {
    const survey = await db.query.surveys.findFirst({
      where: eq(schema.surveys.id, parsed.data.surveyId),
      columns: { id: true, status: true, requireAccessCode: true },
    });
    if (!survey || survey.status !== 'OPEN') {
      return NextResponse.json({ error: 'Esta pesquisa não está mais aberta para respostas.' }, { status: 400 });
    }
    if (!survey.requireAccessCode) {
      return NextResponse.json({ error: 'Esta pesquisa não pede código.' }, { status: 400 });
    }

    const gasto = await db
      .update(schema.surveyAccessCodes)
      // Só o dia: a hora do uso, cruzada com a escala, apontaria quem estava no tablet.
      .set({ usedOn: new Date(saoPauloDay()) })
      .where(and(
        eq(schema.surveyAccessCodes.surveyId, survey.id),
        eq(schema.surveyAccessCodes.codeHash, hashAccessCode(survey.id, parsed.data.accessCode)),
        isNull(schema.surveyAccessCodes.usedOn),
      ))
      .returning({ id: schema.surveyAccessCodes.id });
    if (gasto.length !== 1) {
      await consumeRateLimit('pesquisa-codigo', ip, TETO_ERROS, JANELA);
      return NextResponse.json({ error: CODIGO_INVALIDO }, { status: 400 });
    }

    return NextResponse.json({ ticket: await createSurveyTicket(survey.id), validoPorHoras: TICKET_HOURS });
  } catch (err) {
    // Nunca o erro cru: a mensagem do Drizzle traz os parâmetros da consulta.
    console.error('[survey-tickets]', errorForLog(err));
    return NextResponse.json({ error: 'Não foi possível conferir o código agora. Tente de novo.' }, { status: 500 });
  }
}
