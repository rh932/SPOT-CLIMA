import { createHmac } from 'crypto';
import { sql, lt } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';

/**
 * Limite de tentativas.
 *
 * `consumeRateLimit` grava o contador no Postgres (tabela rate_limits), que é
 * o que vale entre instâncias serverless. Se o banco falhar — ou a migração
 * da tabela ainda não tiver rodado — cai no contador em memória desta
 * instância, que segura menos mas nunca derruba o login.
 *
 * `rateLimit` (em memória, síncrono) continua existindo para a queda e para
 * os testes.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/**
 * Zera o contador de uma chave. Usado depois de um login bem-sucedido: quem
 * acertou a senha não deve ficar perto do teto por ter entrado e saído várias
 * vezes no mesmo intervalo — o limite existe para tentativa errada.
 */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

// Limpeza periódica para evitar crescimento indefinido do Map em processos de longa duração.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

/** Chave gravada no banco: escopo legível + HMAC da identidade (IP, e-mail). */
export function rateLimitKey(scope: string, identity: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET não configurado.');
  const digest = createHmac('sha256', secret).update(`${scope}|${identity}`).digest('base64url').slice(0, 32);
  return `${scope}:${digest}`;
}

let avisouQueda = false;

/**
 * Conta uma tentativa e diz se ainda cabe no limite. Um único upsert atômico:
 * duas instâncias somando ao mesmo tempo não perdem contagem.
 */
export async function consumeRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = rateLimitKey(scope, identity);
  const now = new Date();
  // ISO explícito: coluna `timestamp` sem fuso guarda UTC; um Date cru dentro
  // de sql`` seria convertido no fuso local da máquina.
  const nowIso = now.toISOString();
  const resetIso = new Date(now.getTime() + windowMs).toISOString();
  try {
    const [row] = await db
      .insert(schema.rateLimits)
      .values({ key, count: 1, resetAt: new Date(resetIso) })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: {
          count: sql`CASE WHEN ${schema.rateLimits.resetAt} <= ${nowIso}::timestamp THEN 1 ELSE ${schema.rateLimits.count} + 1 END`,
          resetAt: sql`CASE WHEN ${schema.rateLimits.resetAt} <= ${nowIso}::timestamp THEN ${resetIso}::timestamp ELSE ${schema.rateLimits.resetAt} END`,
        },
      })
      .returning({ count: schema.rateLimits.count, resetAt: schema.rateLimits.resetAt });

    // Faxina ocasional das chaves vencidas (não precisa rodar a cada chamada).
    if (Math.random() < 0.02) {
      db.delete(schema.rateLimits).where(lt(schema.rateLimits.resetAt, now)).catch(() => {});
    }

    return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), resetAt: row.resetAt.getTime() };
  } catch (err) {
    if (!avisouQueda) {
      avisouQueda = true;
      console.error('Limite de tentativas: banco indisponível, usando contador em memória.', err);
    }
    return rateLimit(key, limit, windowMs);
  }
}

/** Zera uma chave do limite compartilhado (e da queda em memória). */
export async function clearRateLimit(scope: string, identity: string): Promise<void> {
  const key = rateLimitKey(scope, identity);
  resetRateLimit(key);
  await db.delete(schema.rateLimits).where(sql`${schema.rateLimits.key} = ${key}`).catch(() => {});
}
