import { createHmac, randomInt } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { open } from './secretBox';
import { verifyTotp } from './totp';
import type { Portal } from './auth';

/**
 * Verificação em duas etapas.
 *
 * Fluxo do login com a etapa ligada:
 * 1. POST /api/auth/login confere a senha e, em vez da sessão, grava um
 *    "desafio" de 5 minutos num cookie próprio (MFA_CHALLENGE_COOKIE) que só
 *    vale para /api/auth/mfa. O desafio não tem papel: o middleware e
 *    requireAdmin/requireGestor nunca o aceitam como sessão.
 * 2. POST /api/auth/mfa/verify confere o código do app (ou um código de
 *    recuperação) e só então emite a sessão normal.
 *
 * O desafio carrega a impressão digital da senha (pv): trocar a senha no
 * meio do caminho derruba o desafio, como derruba a sessão.
 */

export const SECRET_PURPOSE = 'mfa-totp';
export const MFA_CHALLENGE_COOKIE = 'spot_mfa_challenge';
const CHALLENGE_SECONDS = 5 * 60;
const RECOVERY_COUNT = 8;
// Sem 0/O, 1/I/L: o código é lido de um papel e digitado no celular.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET não configurado corretamente.');
  return new TextEncoder().encode(secret);
}

// ------------------------------------------------------------------
// Códigos de recuperação
// ------------------------------------------------------------------

/** Normaliza o que a pessoa digitou: maiúsculas, sem espaço nem hífen. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function hashRecoveryCode(code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET não configurado corretamente.');
  return createHmac('sha256', secret).update(`mfa-recovery|${normalizeRecoveryCode(code)}`).digest('base64url');
}

/** Gera os códigos (mostrados uma vez) e os HMAC que vão para o banco. */
export function generateRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: RECOVERY_COUNT }, () => {
    const chars = Array.from({ length: 8 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

// ------------------------------------------------------------------
// Desafio entre a senha e o código
// ------------------------------------------------------------------

export interface MfaChallenge {
  adminId: string;
  portal: Portal;
  pv: string;
}

export async function createChallengeToken(c: MfaChallenge): Promise<string> {
  return new SignJWT({ purpose: 'mfa', adminId: c.adminId, portal: c.portal, pv: c.pv })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyChallengeToken(token: string): Promise<MfaChallenge | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (payload.purpose !== 'mfa') return null;
    if (typeof payload.adminId !== 'string' || typeof payload.pv !== 'string') return null;
    if (payload.portal !== 'admin' && payload.portal !== 'gestor') return null;
    return { adminId: payload.adminId, portal: payload.portal, pv: payload.pv };
  } catch {
    return null;
  }
}

export function setChallengeCookie(token: string) {
  cookies().set(MFA_CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth/mfa',
    maxAge: CHALLENGE_SECONDS,
  });
}

export function clearChallengeCookie() {
  cookies().set(MFA_CHALLENGE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth/mfa',
    maxAge: 0,
  });
}

export function readChallengeCookie(): string | null {
  return cookies().get(MFA_CHALLENGE_COOKIE)?.value ?? null;
}

// ------------------------------------------------------------------
// Conferência do segundo fator
// ------------------------------------------------------------------

/** Código de 6 dígitos do app ou código de recuperação (XXXX-XXXX). */
export function looksLikeTotp(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ''));
}

/**
 * Confere o código e "gasta" o que for preciso no banco, de forma atômica:
 * - TOTP: grava o passo aceito; o UPDATE só passa se o passo for maior que o
 *   último, então o mesmo código (ou um reenvio simultâneo) não entra duas vezes.
 * - Recuperação: tira o HMAC da lista; o UPDATE só passa se ele ainda estiver lá.
 *
 * `secretSealed` é o segredo cifrado — o confirmado (login, desligar) ou o
 * pendente (ativação).
 */
export async function consumeSecondFactor(
  adminId: string,
  secretSealed: string | null,
  lastStep: number | null,
  code: string,
  opts: { allowRecovery: boolean },
): Promise<{ ok: true; method: 'totp' | 'recovery' } | { ok: false }> {
  if (looksLikeTotp(code)) {
    if (!secretSealed) return { ok: false };
    const secret = open(secretSealed, SECRET_PURPOSE);
    if (!secret) return { ok: false };
    const step = verifyTotp(secret, code, { afterStep: lastStep });
    if (step === null) return { ok: false };
    const updated = await db
      .update(schema.admins)
      .set({ mfaLastStep: step })
      .where(and(
        eq(schema.admins.id, adminId),
        or(isNull(schema.admins.mfaLastStep), lt(schema.admins.mfaLastStep, step)),
      ))
      .returning({ id: schema.admins.id });
    return updated.length === 1 ? { ok: true, method: 'totp' } : { ok: false };
  }

  if (!opts.allowRecovery) return { ok: false };
  const normalized = normalizeRecoveryCode(code);
  if (!/^[A-Z0-9]{8}$/.test(normalized)) return { ok: false };
  const hash = hashRecoveryCode(normalized);
  const updated = await db
    .update(schema.admins)
    .set({ mfaRecoveryCodes: sql`${schema.admins.mfaRecoveryCodes} - ${hash}::text` })
    .where(and(
      eq(schema.admins.id, adminId),
      sql`${schema.admins.mfaRecoveryCodes} @> ${JSON.stringify([hash])}::jsonb`,
    ))
    .returning({ id: schema.admins.id });
  return updated.length === 1 ? { ok: true, method: 'recovery' } : { ok: false };
}

/** Quantos códigos de recuperação ainda valem (para a tela de configuração). */
export function remainingRecoveryCodes(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
