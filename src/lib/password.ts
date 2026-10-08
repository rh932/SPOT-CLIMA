import bcrypt from 'bcryptjs';

/**
 * Hash/verificação de senha isolados num módulo sem dependências do Next.js
 * (next/headers), para poderem ser usados tanto pelas rotas da aplicação
 * quanto por scripts standalone como o seed do banco.
 */

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash de uma senha aleatória descartada, só para gastar o mesmo tempo.
 * Com e-mail inexistente ou conta inativa o login respondia na hora, sem
 * rodar o bcrypt; com conta ativa levava centenas de ms. A diferença dizia
 * quais e-mails existem. Mesmo custo (12) do hash real.
 */
const DUMMY_HASH = '$2a$12$7Wfbgs6yUKfA6hnoHNjCue27EGCS27d.YjLFoMJ5ESd25Yo0Rp1J2';

/** Confere a senha contra o hash da conta — ou contra o hash descartável, no mesmo tempo, quando não há conta. */
export async function verifyPasswordConstantTime(password: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}
