import { createHash } from 'crypto';

/** Usado apenas para armazenar um hash não-reversível de IP em audit logs (nunca o IP em texto puro). */
export function hashIp(ip: string): string {
  const salt = process.env.AUTH_SECRET;
  if (!salt) {
    throw new Error('AUTH_SECRET não configurado — necessário para hashIp().');
  }
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
