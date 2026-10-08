import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { surveySubmissionSchema } from '@/lib/validation';
import { consumeRateLimit } from '@/lib/rateLimit';
import { validateAnswers } from '@/lib/surveyAnswers';
import { clientIp } from '@/lib/clientIp';
import { saoPauloDay } from '@/lib/probation';
import { hashAccessCode, isAccessCodeFormat } from '@/lib/accessCodes';

const CODIGO_INVALIDO = 'Código de participação inválido ou já usado. Confira o papel que você recebeu.';

/** Sinal para desfazer a transação quando o código não vale. */
class CodigoRecusado extends Error {}

/**
 * Submissão anônima de respostas do colaborador.
 * NENHUM identificador de colaborador é aceito ou gravado — apenas surveyId,
 * sectorId, unitId e as respostas às perguntas. Ver src/db/schema.ts (survey_responses).
 *
 * Pesquisa com código de participação (surveys.requireAccessCode): o código
 * é gasto na mesma transação da resposta, e nenhum dos dois aponta para o
 * outro (ver survey_access_codes em src/db/schema.ts).
 */
export async function POST(req: NextRequest) {
  // Contador compartilhado entre instâncias (o em memória não segurava envio
  // repetido na Vercel). Folgado de propósito: no restaurante o Wi-Fi é um IP
  // só para todo mundo. Só a contagem por HMAC do IP fica no banco — nada
  // dela é ligado à resposta gravada.
  const limit = await consumeRateLimit('pesquisa-envio', clientIp(req.headers), 20, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Muitas submissões em pouco tempo. Tente novamente mais tarde.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = surveySubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Não foi possível registrar sua resposta. Verifique o preenchimento.' }, { status: 400 });
  }

  const survey = await db.query.surveys.findFirst({ where: eq(schema.surveys.id, parsed.data.surveyId) });
  if (!survey || survey.status !== 'OPEN') {
    return NextResponse.json({ error: 'Esta pesquisa não está mais aberta para respostas.' }, { status: 400 });
  }

  const accessCode = parsed.data.accessCode ?? '';
  if (survey.requireAccessCode && !isAccessCodeFormat(accessCode)) {
    return NextResponse.json({ error: CODIGO_INVALIDO, accessCode: 'invalid' }, { status: 400 });
  }

  const sector = await db.query.sectors.findFirst({
    where: and(eq(schema.sectors.id, parsed.data.sectorId), eq(schema.sectors.active, true), eq(schema.sectors.inSurvey, true)),
  });
  if (!sector) {
    return NextResponse.json({ error: 'Setor inválido.' }, { status: 400 });
  }

  const unit = await db.query.units.findFirst({
    where: and(eq(schema.units.id, parsed.data.unitId), eq(schema.units.active, true)),
  });
  if (!unit) {
    return NextResponse.json({ error: 'Unidade inválida.' }, { status: 400 });
  }

  const questions = await db.query.questions.findMany({
    where: and(eq(schema.questions.surveyId, survey.id), eq(schema.questions.active, true)),
    with: { options: { columns: { label: true } } },
  });

  // Tipo x campo preenchido e obrigatoriedade conferidos no servidor (nunca
  // confiar só na validação do cliente) — regra em src/lib/surveyAnswers.ts.
  const { rows, missingRequired } = validateAnswers(questions, parsed.data.answers);
  if (missingRequired.length > 0) {
    return NextResponse.json(
      { error: 'Existem perguntas obrigatórias não respondidas.', missing: missingRequired },
      { status: 400 }
    );
  }
  // Envio sem nenhuma resposta válida não é gravado: ele contaria como uma
  // pessoa no setor e, repetido algumas vezes, liberaria o resultado de um
  // setor pequeno abaixo do limite de anonimato.
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Responda ao menos uma pergunta antes de enviar.' }, { status: 400 });
  }

  // Datas só com o DIA (resposta e uso do código): o horário exato, cruzado com
  // a escala ou com quem estava no tablet, identifica quem respondeu.

  // Envio, respostas e código juntos: uma falha no meio não pode deixar um
  // envio vazio gravado, nem gastar um código sem a resposta (ou o contrário).
  try {
    await db.transaction(async (tx) => {
      if (survey.requireAccessCode) {
        const gasto = await tx
          .update(schema.surveyAccessCodes)
          // Também só o dia: a hora do uso, cruzada com a da resposta, ligaria as duas.
          .set({ usedOn: new Date(saoPauloDay()) })
          .where(and(
            eq(schema.surveyAccessCodes.surveyId, survey.id),
            eq(schema.surveyAccessCodes.codeHash, hashAccessCode(survey.id, accessCode)),
            isNull(schema.surveyAccessCodes.usedOn),
          ))
          .returning({ id: schema.surveyAccessCodes.id });
        if (gasto.length !== 1) throw new CodigoRecusado();
      }
      const [response] = await tx
        .insert(schema.surveyResponses)
        .values({ surveyId: survey.id, sectorId: sector.id, unitId: unit.id, createdAt: new Date(saoPauloDay()) })
        .returning({ id: schema.surveyResponses.id });
      await tx.insert(schema.responseAnswers).values(rows.map((r) => ({ ...r, responseId: response.id })));
    });
  } catch (err) {
    if (!(err instanceof CodigoRecusado)) throw err;
    // 31^8 combinações não se adivinham, mas também não precisam ser testadas à vontade.
    const tentativas = await consumeRateLimit('pesquisa-codigo', clientIp(req.headers), 30, 10 * 60 * 1000);
    if (!tentativas.allowed) {
      return NextResponse.json({ error: 'Muitos códigos errados em pouco tempo. Tente de novo mais tarde.' }, { status: 429 });
    }
    return NextResponse.json({ error: CODIGO_INVALIDO, accessCode: 'invalid' }, { status: 400 });
  }

  // Nenhum log de auditoria aqui — auditoria é só para ações administrativas,
  // nunca para o envio de uma resposta anônima (isso criaria um rastro individual).

  return NextResponse.json({ ok: true });
}
