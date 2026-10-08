import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Verificação em duas etapas: o TOTP contra os vetores da RFC 6238, a cifra
 * dos segredos, os códigos de recuperação e — o mais importante — que o
 * desafio entre a senha e o código nunca vale como sessão.
 */

process.env.AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined, set: () => {} }) }));
vi.mock('@/db', () => ({ db: {} }));

const { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totpAt, totpStep, verifyTotp } = await import('@/lib/totp');
const { open, seal } = await import('@/lib/secretBox');
const { createChallengeToken, generateRecoveryCodes, hashRecoveryCode, looksLikeTotp, normalizeRecoveryCode, verifyChallengeToken } =
  await import('@/lib/mfa');
const { verifySessionToken } = await import('@/lib/auth');
const { middleware } = await import('@/middleware');

describe('TOTP (RFC 6238)', () => {
  // Apêndice B da RFC: segredo ASCII "12345678901234567890", SHA-1, 8 dígitos.
  const secret = Buffer.from('12345678901234567890');
  const vetores: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  it.each(vetores)('instante %i → %s', (t, esperado) => {
    expect(totpAt(secret, totpStep(t * 1000), 8)).toBe(esperado);
  });

  it('base32 ida e volta', () => {
    const buf = Buffer.from('12345678901234567890');
    expect(base32Encode(buf)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv-gy3tqojqgezdgnbvgy3tqojq').equals(buf)).toBe(true);
  });

  it('aceita o passo atual e um vizinho; recusa dois passos de distância', () => {
    const s = generateTotpSecret();
    const now = 1_790_000_000_000;
    const passo = totpStep(now);
    const codigo = (p: number) => totpAt(base32Decode(s), p);
    expect(verifyTotp(s, codigo(passo), { nowMs: now })).toBe(passo);
    expect(verifyTotp(s, codigo(passo - 1), { nowMs: now })).toBe(passo - 1);
    expect(verifyTotp(s, codigo(passo + 1), { nowMs: now })).toBe(passo + 1);
    expect(verifyTotp(s, codigo(passo - 2), { nowMs: now })).toBeNull();
  });

  it('não aceita de novo um passo já usado (reenvio do mesmo código)', () => {
    const s = generateTotpSecret();
    const now = 1_790_000_000_000;
    const passo = totpStep(now);
    const c = totpAt(base32Decode(s), passo);
    expect(verifyTotp(s, c, { nowMs: now, afterStep: passo })).toBeNull();
    expect(verifyTotp(s, c, { nowMs: now, afterStep: passo - 1 })).toBe(passo);
  });

  it('recusa formato errado', () => {
    const s = generateTotpSecret();
    expect(verifyTotp(s, '12345')).toBeNull();
    expect(verifyTotp(s, 'abcdef')).toBeNull();
  });

  it('URI do app traz emissor e conta', () => {
    const uri = otpauthUri('ABC', 'rh@spot.com');
    expect(uri.startsWith('otpauth://totp/SPOT%20CLIMA%3Arh%40spot.com?')).toBe(true);
    expect(uri).toContain('issuer=SPOT+CLIMA');
  });
});

describe('segredo cifrado no banco', () => {
  it('abre com a mesma finalidade e recusa outra finalidade ou adulteração', () => {
    const selado = seal('SEGREDO', 'mfa-totp');
    expect(selado).not.toContain('SEGREDO');
    expect(open(selado, 'mfa-totp')).toBe('SEGREDO');
    expect(open(selado, 'outra-coisa')).toBeNull();
    const partes = selado.split('.');
    partes[2] = Buffer.from('XXXXXXX').toString('base64url');
    expect(open(partes.join('.'), 'mfa-totp')).toBeNull();
  });
});

describe('códigos de recuperação', () => {
  it('gera 8 códigos distintos no formato XXXX-XXXX e só guarda o HMAC', () => {
    const { codes, hashes } = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hashes.join(' ')).not.toContain(codes[0].replace('-', ''));
  });

  it('o digitado vale com minúscula, espaço ou sem hífen', () => {
    expect(normalizeRecoveryCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(hashRecoveryCode('abcd efgh')).toBe(hashRecoveryCode('ABCD-EFGH'));
  });

  it('distingue código do app de código de recuperação', () => {
    expect(looksLikeTotp('123 456')).toBe(true);
    expect(looksLikeTotp('ABCD-EFGH')).toBe(false);
  });
});

describe('desafio entre a senha e o código', () => {
  it('ida e volta do desafio', async () => {
    const t = await createChallengeToken({ adminId: 'a1', portal: 'admin', pv: 'x' });
    expect(await verifyChallengeToken(t)).toEqual({ adminId: 'a1', portal: 'admin', pv: 'x' });
  });

  it('nunca vale como sessão, nem com o papel enxertado', async () => {
    const t = await createChallengeToken({ adminId: 'a1', portal: 'admin', pv: 'x' });
    expect(await verifySessionToken(t)).toBeNull();

    // Middleware: o desafio no cookie de sessão não abre o painel.
    const req = new NextRequest('http://localhost/admin', { headers: { cookie: `spot_admin_session=${t}` } });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin/login');
  });

  it('sessão comum não serve de desafio', async () => {
    const { createSessionToken } = await import('@/lib/auth');
    const sessao = await createSessionToken({ adminId: 'a1', email: 'a@b.c', name: 'A', role: 'RH' }, 'hash');
    expect(await verifyChallengeToken(sessao)).toBeNull();
  });
});
