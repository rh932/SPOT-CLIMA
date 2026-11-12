/**
 * IP de quem fez a requisição, para limite de tentativas e hash de auditoria.
 *
 * Na Vercel, `x-real-ip` e o primeiro valor de `x-forwarded-for` são escritos
 * pela própria plataforma (o valor mandado pelo cliente é substituído). Fora
 * de um proxy confiável os dois podem ser forjados — por isso o limite por IP
 * é sempre o mais folgado, e o limite forte é por conta.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : 'unknown';
}
