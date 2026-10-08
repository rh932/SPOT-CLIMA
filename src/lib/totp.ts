import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * TOTP (RFC 6238) — o código de 6 dígitos que muda a cada 30 s no app
 * autenticador (Google Authenticator, Microsoft Authenticator, Authy...).
 *
 * Implementado aqui, sem biblioteca, porque é pequeno e fácil de testar contra
 * os vetores da própria RFC (tests/mfa.test.ts).
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('Segredo base32 inválido.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 bytes aleatórios (160 bits, o tamanho do SHA-1), em base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Passo de tempo (contador de 30 s) de um instante. */
export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** Código de um passo específico (HOTP com o contador = passo). */
export function totpAt(secret: Buffer, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/**
 * Confere um código aceitando um passo antes e um depois (relógio do celular
 * adiantado/atrasado até ~30 s). Devolve o passo que bateu, para o chamador
 * recusar o mesmo passo de novo, ou null.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { nowMs?: number; afterStep?: number | null; window?: number } = {},
): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const secret = base32Decode(secretBase32);
  const now = totpStep(opts.nowMs);
  const window = opts.window ?? 1;
  let matched: number | null = null;
  for (let step = now - window; step <= now + window; step++) {
    if (opts.afterStep != null && step <= opts.afterStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    // Compara todos os passos, sem sair no primeiro acerto: o tempo não diz qual bateu.
    if (timingSafeEqual(expected, Buffer.from(digits)) && matched === null) matched = step;
  }
  return matched;
}

/** URI que o app autenticador lê pelo QR code. */
export function otpauthUri(secretBase32: string, account: string, issuer = 'SPOT CLIMA'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
