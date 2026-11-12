import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Cifra pequenos segredos guardados no banco (hoje: o segredo TOTP da
 * verificação em duas etapas).
 *
 * A chave é derivada do AUTH_SECRET, que fica só nas variáveis da Vercel: uma
 * cópia do banco (backup, dump vazado) sozinha não gera códigos. Trocar o
 * AUTH_SECRET invalida estes segredos — quem tinha duas etapas precisa
 * configurar de novo (o Super Admin zera pela aba Usuários, ou
 * `npm run db:reset-mfa -- <email>`).
 *
 * Formato: v1.<iv>.<cifra>.<tag>, tudo em base64url.
 */
function key(purpose: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET não configurado corretamente.');
  }
  return createHash('sha256').update(`secretbox|${purpose}|${secret}`).digest();
}

export function seal(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(purpose), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), body.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

/** Devolve null se o valor não abre (chave trocada, valor adulterado). */
export function open(sealed: string, purpose: string): string | null {
  const [v, iv, body, tag] = sealed.split('.');
  if (v !== 'v1' || !iv || !body || !tag) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(purpose), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
