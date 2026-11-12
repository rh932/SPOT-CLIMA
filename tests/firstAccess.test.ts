import { describe, it, expect } from 'vitest';
import { codeMatches, firstAccessCode, formatCode, normalizeCode } from '../src/lib/firstAccess';
import { accessMessage, firstAccessLink, parseFirstAccessHash } from '../src/lib/userAccess';
import { REMINDER_OFFSETS } from '../src/lib/feedbackCycle';

const SEGREDO = 'segredo-de-teste-com-mais-de-16';

describe('código de primeiro acesso', () => {
  const code = firstAccessCode('admin-1', 'hash-da-senha-do-rh', SEGREDO);

  it('8 caracteres sem letras ou números que se confundem', () => {
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(formatCode(code)).toMatch(/^.{4}-.{4}$/);
  });

  it('é estável para a mesma conta e senha, e muda quando a senha muda (uso único)', () => {
    expect(firstAccessCode('admin-1', 'hash-da-senha-do-rh', SEGREDO)).toBe(code);
    expect(firstAccessCode('admin-1', 'hash-da-senha-nova', SEGREDO)).not.toBe(code);
    expect(firstAccessCode('admin-2', 'hash-da-senha-do-rh', SEGREDO)).not.toBe(code);
  });

  it('aceita o código digitado com hífen, espaço ou minúsculas; recusa outro', () => {
    const digitado = `${code.slice(0, 4).toLowerCase()} - ${code.slice(4)}`;
    expect(normalizeCode(digitado)).toBe(code);
    expect(codeMatches(digitado, 'admin-1', 'hash-da-senha-do-rh', SEGREDO)).toBe(true);
    expect(codeMatches('AAAA-AAAA', 'admin-1', 'hash-da-senha-do-rh', SEGREDO)).toBe(false);
    expect(codeMatches(code, 'admin-1', 'hash-da-senha-nova', SEGREDO)).toBe(false);
    expect(codeMatches('', 'admin-1', 'hash-da-senha-do-rh', SEGREDO)).toBe(false);
  });
});

describe('link e mensagem de primeiro acesso', () => {
  const origin = 'https://spot-clima.vercel.app';

  it('o link leva e-mail e código no fragmento, e a tela os lê de volta', () => {
    const link = firstAccessLink(origin, 'GESTOR', 'joao.silva@spot.com', 'ABCD-EFGH');
    expect(link.startsWith('https://spot-clima.vercel.app/gestor/login#primeiro-acesso?')).toBe(true);
    expect(parseFirstAccessHash(new URL(link).hash)).toEqual({ email: 'joao.silva@spot.com', code: 'ABCD-EFGH' });
    expect(parseFirstAccessHash('#primeiro-acesso')).toEqual({ email: '', code: '' });
    expect(parseFirstAccessHash('#outra-coisa')).toBeNull();
  });

  it('pendente recebe o link e o código; quem já entrou, só o endereço', () => {
    const pendente = accessMessage({ name: 'JOAO SILVA', email: 'joao.silva@spot.com', role: 'GESTOR', firstAccessCode: 'ABCD-EFGH' }, origin);
    expect(pendente).toContain('#primeiro-acesso?');
    expect(pendente).toContain('código ABCD-EFGH');
    expect(pendente).not.toMatch(/senha: /i);
    const ativo = accessMessage({ name: 'JOAO SILVA', email: 'joao.silva@spot.com', role: 'GESTOR', firstAccessCode: null }, origin);
    expect(ativo).not.toContain('primeiro-acesso');
    expect(ativo).toContain('Acesse: https://spot-clima.vercel.app/gestor/login');
  });

  it('as duas mensagens ensinam a ligar o aviso no celular, com o passo do iPhone', () => {
    for (const code of ['ABCD-EFGH', null]) {
      const m = accessMessage({ name: 'Ana', email: 'ana.lima@spot.com', role: 'GESTOR', firstAccessCode: code }, origin);
      expect(m).toContain('Para ativar os avisos no celular:');
      expect(m).toContain('não são repetitivos');
      expect(m).toContain('Adicionar à Tela de Início');
      expect(m).toContain('"Ativar"');
    }
  });
});

describe('o que a mensagem promete sobre os avisos', () => {
  it('os dias citados na mensagem são os da rotina — mudou um, mude o outro', () => {
    expect([...REMINDER_OFFSETS]).toEqual([7, 3, 1, 0, -1, -7]);
    const m = accessMessage({ name: 'Ana', email: 'ana.lima@spot.com', role: 'GESTOR', firstAccessCode: null }, 'https://x.app');
    expect(m).toContain('só 6 lembretes automáticos: 7, 3 e 1 dia antes do prazo, no próprio dia e, se atrasar, 1 e 7 dias depois');
  });
  it('treinador e RH recebem o texto do que chega para eles', () => {
    expect(accessMessage({ name: 'Bia', email: 'b@spot.com', role: 'TREINADOR', firstAccessCode: null }, 'https://x.app')).toContain('formulário de treinamento');
    expect(accessMessage({ name: 'Rita', email: 'r@spot.com', role: 'RH', firstAccessCode: null }, 'https://x.app')).toContain('movimentação nas equipes');
  });
});

describe('mensagem do grupo dos gestores', () => {
  it('traz o site e os avisos, e nenhum link ou código pessoal', async () => {
    const { groupMessage } = await import('../src/lib/userAccess');
    const m = groupMessage('https://spot-clima.vercel.app');
    expect(m).toContain('Site: https://spot-clima.vercel.app/gestor/login');
    expect(m).toContain('só 6 lembretes automáticos: 7, 3 e 1 dia antes do prazo, no próprio dia e, se atrasar, 1 e 7 dias depois');
    expect(m).toContain('Adicionar à Tela de Início');
    expect(m).not.toContain('primeiro-acesso');
    expect(m).not.toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
    expect(m).not.toContain('@spot.com');
  });
});
