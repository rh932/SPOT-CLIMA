import { db } from '@/db';
import * as schema from '@/db/schema';
import { hashIp } from './hash';
import { clientIp } from './clientIp';
import { NextRequest } from 'next/server';

/**
 * Registra uma ação administrativa no log de auditoria.
 * NUNCA passe conteúdo de resposta de pesquisa em `metadata` — apenas
 * metadados operacionais (ex.: nome da pesquisa, id da pergunta alterada).
 * Senha, token e cookie também nunca entram (ver SENSITIVE_KEYS).
 */
export async function logAudit(params: {
  adminId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  req?: NextRequest;
}) {
  try {
    const ip = params.req ? clientIp(params.req.headers) : null;
    await db.insert(schema.auditLogs).values({
      adminId: params.adminId,
      action: cleanText(params.action, 80),
      entityType: params.entityType ? cleanText(params.entityType, 80) : null,
      entityId: params.entityId ? cleanText(params.entityId, 80) : null,
      metadata: params.metadata ? sanitizeMetadata(params.metadata) : null,
      ipHash: ip && ip !== 'unknown' ? hashIp(ip) : null,
    });
  } catch (err) {
    // Auditoria nunca deve derrubar a requisição principal.
    console.error('Falha ao gravar log de auditoria:', err);
  }
}

const SENSITIVE_KEYS = /pass|senha|token|secret|cookie|authorization|hash|code|codigo/i;

/** Sem caracteres de controle (quebra de linha forjada num log) e com teto de tamanho. */
function cleanText(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').slice(0, max);
}

/**
 * Metadados de auditoria vêm muitas vezes de dados digitados (nome de
 * funcionário, filtros de busca). Antes de gravar: tira caracteres de
 * controle, corta texto longo, limita profundidade e quantidade de chaves e
 * descarta qualquer campo com cara de credencial.
 */
export function sanitizeMetadata(meta: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(meta).slice(0, 30)) {
    const key = cleanText(rawKey, 60);
    if (SENSITIVE_KEYS.test(key)) continue;
    out[key] = sanitizeValue(value, depth);
  }
  return out;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return cleanText(value, 300);
  if (Array.isArray(value)) return depth >= 2 ? '[...]' : value.slice(0, 30).map((v) => sanitizeValue(v, depth + 1));
  if (typeof value === 'object') return depth >= 2 ? '{...}' : sanitizeMetadata(value as Record<string, unknown>, depth + 1);
  return String(value).slice(0, 100);
}
