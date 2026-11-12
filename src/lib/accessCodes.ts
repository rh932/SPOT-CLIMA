import { createHmac, randomInt } from 'crypto';
import { ACCESS_CODE_ALPHABET, normalizeAccessCode } from './accessCodeFormat';

export { formatAccessCode, isAccessCodeFormat, normalizeAccessCode, parseAccessCodeHash } from './accessCodeFormat';

/**
 * Códigos de participação de uso único da pesquisa de clima.
 *
 * O RH imprime um papelzinho por pessoa; cada código vale UMA resposta. Isso
 * barra o envio repetido (que, num setor pequeno, deixava descobrir por
 * subtração o que um colega respondeu) sem identificar ninguém:
 * - o código nunca é gravado, só o HMAC dele (amarrado à pesquisa);
 * - a resposta não aponta para o código e o código não aponta para a resposta;
 * - o uso fica registrado só com o dia, como a própria resposta.
 */

export function generateAccessCode(): string {
  const chars = Array.from({ length: 8 }, () => ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Gera `n` códigos distintos. */
export function generateAccessCodes(n: number): string[] {
  const set = new Set<string>();
  while (set.size < n) set.add(generateAccessCode());
  return [...set];
}

/** HMAC do código, amarrado à pesquisa: o código de uma pesquisa não vale em outra. */
export function hashAccessCode(surveyId: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET não configurado corretamente.');
  return createHmac('sha256', secret).update(`pesquisa-codigo|${surveyId}|${normalizeAccessCode(code)}`).digest('base64url');
}

/** Link do papelzinho: o código vai no fragmento (#), que o navegador nunca manda ao servidor. */
export function accessCodeLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/survey#codigo=${encodeURIComponent(code)}`;
}
