import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { DrizzleQueryError } from 'drizzle-orm/errors';

process.env.AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';

const { createSurveyTicket, verifySurveyTicket, ticketHash } = await import('@/lib/surveyTicket');
const { errorForLog, errorSummary, isUniqueViolation } = await import('@/lib/dbErrors');

const chave = () => new TextEncoder().encode(process.env.AUTH_SECRET);

describe('bilhete de resposta (pesquisa com código de participação)', () => {
  it('vale para a pesquisa em que foi emitido e devolve o identificador aleatório', async () => {
    const t = await createSurveyTicket('pesquisa-a');
    const jti = await verifySurveyTicket(t, 'pesquisa-a');
    expect(jti).toMatch(/^[\w-]{20,}$/);
  });

  it('não vale para outra pesquisa', async () => {
    const t = await createSurveyTicket('pesquisa-a');
    expect(await verifySurveyTicket(t, 'pesquisa-b')).toBeNull();
  });

  it('cada bilhete tem um identificador próprio', async () => {
    const [a, b] = await Promise.all([createSurveyTicket('p'), createSurveyTicket('p')]);
    expect(await verifySurveyTicket(a, 'p')).not.toBe(await verifySurveyTicket(b, 'p'));
  });

  it('recusa token de sessão ou de outra finalidade, mesmo assinado com a mesma chave', async () => {
    const sessao = await new SignJWT({ sub: 'admin-1', role: 'SUPER_ADMIN', sid: 'p' })
      .setProtectedHeader({ alg: 'HS256' }).setJti('x').setExpirationTime('1h').sign(chave());
    const mfa = await new SignJWT({ purpose: 'mfa', sid: 'p' })
      .setProtectedHeader({ alg: 'HS256' }).setJti('x').setExpirationTime('1h').sign(chave());
    expect(await verifySurveyTicket(sessao, 'p')).toBeNull();
    expect(await verifySurveyTicket(mfa, 'p')).toBeNull();
  });

  it('recusa bilhete vencido, adulterado ou lixo', async () => {
    const vencido = await new SignJWT({ purpose: 'survey-ticket', sid: 'p' })
      .setProtectedHeader({ alg: 'HS256' }).setJti('x').setIssuedAt(1).setExpirationTime(2).sign(chave());
    expect(await verifySurveyTicket(vencido, 'p')).toBeNull();
    const [h, p] = (await createSurveyTicket('p')).split('.');
    const assinaturaDeOutro = (await createSurveyTicket('p')).split('.')[2];
    expect(await verifySurveyTicket(`${h}.${p}.${assinaturaDeOutro}`, 'p')).toBeNull();
    expect(await verifySurveyTicket('nada', 'p')).toBeNull();
  });

  it('o que vai para o banco é um HMAC estável do identificador, nunca o bilhete', async () => {
    const t = await createSurveyTicket('p');
    const jti = (await verifySurveyTicket(t, 'p'))!;
    expect(ticketHash(jti)).toBe(ticketHash(jti));
    expect(ticketHash(jti)).not.toContain(jti);
    expect(ticketHash(jti)).not.toBe(ticketHash(jti + 'x'));
  });
});

describe('erros do banco no log', () => {
  const pg = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505', constraint: 'survey_ticket_uses_pkey', table: 'survey_ticket_uses',
    detail: 'Key (ticket_hash)=(segredo) already exists.',
  });
  const embrulhado = new DrizzleQueryError('insert into "response_answers" values ($1, $2)', ['comentário sincero', 'setor-x'], pg);

  it('reconhece violação de índice único através do embrulho do Drizzle', () => {
    expect(isUniqueViolation(pg)).toBe(true);
    expect(isUniqueViolation(embrulhado)).toBe(true);
    expect(isUniqueViolation(new Error('outro'))).toBe(false);
  });

  it('nunca leva para o log os parâmetros, a consulta nem o detalhe do Postgres', () => {
    for (const e of [pg, embrulhado]) {
      const log = JSON.stringify(errorForLog(e));
      expect(log).toContain('23505');
      expect(log).not.toMatch(/comentário|setor-x|segredo|insert into/);
      expect(errorSummary(e)).not.toMatch(/comentário|setor-x|segredo/);
    }
  });

  it('falha de consulta sem código (conexão caiu) também não mostra os parâmetros', () => {
    const caiu = new DrizzleQueryError('select $1', ['texto da resposta'], new Error('Connection terminated'));
    const log = JSON.stringify(errorForLog(caiu));
    expect(log).toContain('Connection terminated');
    expect(log).not.toContain('texto da resposta');
  });
});
