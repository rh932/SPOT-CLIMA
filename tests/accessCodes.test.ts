import { describe, it, expect } from 'vitest';

process.env.AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';

const {
  accessCodeLink, formatAccessCode, generateAccessCodes, hashAccessCode, isAccessCodeFormat, parseAccessCodeHash,
} = await import('@/lib/accessCodes');

describe('códigos de participação', () => {
  it('gera códigos distintos no formato XXXX-XXXX, sem caracteres parecidos', () => {
    const codes = generateAccessCodes(300);
    expect(new Set(codes).size).toBe(300);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(c).not.toMatch(/[01ILO]/);
      expect(isAccessCodeFormat(c)).toBe(true);
    }
  });

  it('aceita o digitado em minúscula, com espaço ou sem hífen', () => {
    expect(isAccessCodeFormat('abcd efgh')).toBe(true);
    expect(formatAccessCode('abcdefgh')).toBe('ABCD-EFGH');
    expect(isAccessCodeFormat('ABCD-EFG')).toBe(false);
    expect(isAccessCodeFormat('ABCD-EFG1')).toBe(false);
  });

  it('o HMAC é amarrado à pesquisa e não contém o código', () => {
    const a = hashAccessCode('pesquisa-1', 'ABCD-EFGH');
    expect(hashAccessCode('pesquisa-1', 'abcd efgh')).toBe(a);
    expect(hashAccessCode('pesquisa-2', 'ABCD-EFGH')).not.toBe(a);
    expect(a).not.toContain('ABCDEFGH');
  });

  it('o link do papel leva o código no fragmento, que não vai ao servidor', () => {
    const link = accessCodeLink('https://spot-clima.vercel.app/', 'ABCD-EFGH');
    expect(link).toBe('https://spot-clima.vercel.app/survey#codigo=ABCD-EFGH');
    expect(new URL(link).search).toBe('');
    expect(parseAccessCodeHash(new URL(link).hash)).toBe('ABCD-EFGH');
    expect(parseAccessCodeHash('#codigo=lixo')).toBeNull();
    expect(parseAccessCodeHash('#outra=coisa')).toBeNull();
    expect(parseAccessCodeHash('#codigo=%E0%A4%A')).toBeNull();
  });
});
