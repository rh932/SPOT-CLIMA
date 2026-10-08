import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { hashPassword, verifyPassword } from './password';
import { passwordFingerprint } from './sessionFingerprint';

export { hashPassword, verifyPassword };

// Cookies separados por portal: logar no /gestor não pode derrubar ou
// sobrescrever uma sessão aberta em /admin no mesmo navegador (e vice-versa) —
// os dois painéis são independentes, mesmo abertos em abas simultâneas.
export type Portal = 'admin' | 'gestor';
const SESSION_COOKIES: Record<Portal, string> = {
  admin: 'spot_admin_session',
  gestor: 'spot_gestor_session',
};
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 horas

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  // O valor de exemplo do .env.example passa no tamanho mínimo, mas é público:
  // com ele qualquer pessoa assina um token de Super Admin.
  if (!secret || secret.length < 16 || secret.startsWith('troque-por')) {
    throw new Error('AUTH_SECRET não configurado corretamente. Defina um valor forte no .env.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * O token carrega só identidade e papel. O escopo do gestor (unidades,
 * setores, turno) NÃO fica aqui de propósito: é lido do banco a cada
 * requisição em requireGestor() (src/lib/apiAuth.ts), para que mudança de
 * escopo e revogação de acesso valham na hora, e não só no próximo login.
 */
export interface SessionPayload {
  adminId: string;
  email: string;
  name: string;
  role: string;
  /** Impressão digital da senha (src/lib/sessionFingerprint.ts): trocar a senha derruba o token. */
  pv?: string;
}

export async function createSessionToken(
  payload: Omit<SessionPayload, 'pv'>,
  passwordHash: string,
): Promise<string> {
  return new SignJWT({ ...payload, pv: passwordFingerprint(passwordHash) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    // Algoritmo fixo: um token com outro `alg` (inclusive "none") é recusado.
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] });
    // Token com finalidade própria (o desafio da verificação em duas etapas,
    // src/lib/mfa.ts) é assinado com a mesma chave, mas nunca vale como sessão.
    if (payload.purpose !== undefined) return null;
    if (typeof payload.adminId !== 'string' || typeof payload.role !== 'string') return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(portal: Portal, token: string) {
  cookies().set(SESSION_COOKIES[portal], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export function clearSessionCookie(portal: Portal) {
  cookies().set(SESSION_COOKIES[portal], '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSession(portal: Portal): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIES[portal])?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export { SESSION_COOKIES };
