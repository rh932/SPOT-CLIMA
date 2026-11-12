import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Impressão digital da senha dentro do token de sessão.
 *
 * O JWT é stateless e dura 8h. Sem isto, trocar a senha (porque alguém viu,
 * porque o celular foi perdido) não derrubava a sessão aberta com a senha
 * antiga. O token guarda HMAC(AUTH_SECRET, hash da senha); a cada requisição
 * requireAdmin/requireGestor recalculam com o hash ATUAL do banco — que eles
 * já leem — e recusam se não bater. Sem coluna nova nem tabela de sessões:
 * mesma ideia do código de primeiro acesso (src/lib/firstAccess.ts).
 *
 * O valor não revela o hash (é um HMAC com segredo do servidor) e só serve
 * para comparar.
 */
export function passwordFingerprint(passwordHash: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET não configurado corretamente.');
  }
  return createHmac('sha256', secret).update(`sessao|${passwordHash}`).digest('base64url').slice(0, 22);
}

export function fingerprintMatches(tokenValue: unknown, passwordHash: string): boolean {
  if (typeof tokenValue !== 'string') return false;
  const expected = Buffer.from(passwordFingerprint(passwordHash));
  const given = Buffer.from(tokenValue);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
