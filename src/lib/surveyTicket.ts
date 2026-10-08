import { createHmac, randomBytes } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Bilhete de resposta da pesquisa com código de participação.
 *
 * Ao começar a pesquisa, o código do papel é gasto e troca-se por este
 * bilhete: um JWT assinado com o número da pesquisa e um identificador
 * aleatório (jti) — nada do código. No envio, o HMAC do jti entra em
 * survey_ticket_uses junto com a resposta, e é isso que impede usar o mesmo
 * bilhete duas vezes. Como o banco nunca guarda a ligação código → bilhete,
 * quem tem acesso ao banco e sabe quem recebeu cada papel não chega à
 * resposta (ver survey_ticket_uses em src/db/schema.ts).
 *
 * Risco que sobra, e que o RH precisa saber: com o banco aberto e pouquíssimo
 * movimento, a ORDEM das transações (gasto do código, depois a resposta) ainda
 * permite palpites. Acesso direto ao banco continua restrito a quem já pode
 * ver tudo.
 */

const PURPOSE = 'survey-ticket';
/** Tempo para responder depois de digitar o código. */
export const TICKET_HOURS = 12;

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET não configurado corretamente.');
  return new TextEncoder().encode(secret);
}

export async function createSurveyTicket(surveyId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, sid: surveyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomBytes(16).toString('base64url'))
    .setIssuedAt()
    .setExpirationTime(`${TICKET_HOURS}h`)
    .sign(key());
}

/** Devolve o jti se o bilhete for válido para esta pesquisa; senão, null. */
export async function verifySurveyTicket(token: string, surveyId: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.purpose !== PURPOSE || payload.sid !== surveyId || typeof payload.jti !== 'string') return null;
    return payload.jti;
  } catch {
    return null;
  }
}

/** O que vai para survey_ticket_uses: HMAC do jti, nunca o bilhete. */
export function ticketHash(jti: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET não configurado corretamente.');
  return createHmac('sha256', secret).update(`bilhete|${jti}`).digest('base64url');
}
