import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Código de primeiro acesso.
 *
 * O gestor cria a própria senha no primeiro acesso, mas o e-mail sozinho não
 * basta: ele segue um padrão previsível (primeiro.segundo@spot.com), e quem
 * soubesse o nome de um gestor pendente poderia criar a senha antes dele e
 * ver as avaliações da equipe. O código é o segredo que o RH manda junto.
 *
 * Ele não é guardado: sai de um HMAC do id da conta com o hash da senha
 * atual. Quando a pessoa cria a senha, o hash muda e o código morre sozinho
 * (uso único); se o RH gerar uma senha nova para a conta, sai um código novo.
 * A rota ainda exige que a conta nunca tenha entrado.
 */

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L
const TAMANHO = 8;

function segredo(secret?: string): string {
  const s = secret ?? process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET não configurado corretamente.');
  return s;
}

export function firstAccessCode(adminId: string, passwordHash: string, secret?: string): string {
  const mac = createHmac('sha256', segredo(secret)).update(`primeiro-acesso|${adminId}|${passwordHash}`).digest();
  let out = '';
  for (let i = 0; i < TAMANHO; i++) out += ALFABETO[mac[i] % ALFABETO.length];
  return out;
}

/** "abcd efgh", "ABCD-EFGH" → "ABCDEFGH". */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export function codeMatches(typed: string, adminId: string, passwordHash: string, secret?: string): boolean {
  const a = Buffer.from(normalizeCode(typed));
  const b = Buffer.from(firstAccessCode(adminId, passwordHash, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}
