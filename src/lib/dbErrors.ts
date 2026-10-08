/**
 * Erros do banco, lidos do jeito certo para o Drizzle 0.44+.
 *
 * Desde a 0.44 todo erro de consulta vem embrulhado em DrizzleQueryError: o
 * erro do Postgres (com o SQLSTATE em `code`) fica em `cause`, e a mensagem
 * do embrulho é "Failed query: ... params: ...". Isso tem dois efeitos:
 * - quem testava `err.code === '23505'` passou a nunca acertar;
 * - logar o erro inteiro grava os PARÂMETROS da consulta — numa resposta de
 *   pesquisa, o texto dos comentários com setor e unidade, ao lado do IP e
 *   da hora que a Vercel registra em cada requisição.
 */

interface PgLike {
  code?: unknown;
  constraint?: unknown;
  table?: unknown;
  cause?: unknown;
}

function pgError(err: unknown): PgLike | null {
  let atual: unknown = err;
  for (let i = 0; i < 3 && atual && typeof atual === 'object'; i++) {
    const e = atual as PgLike;
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e;
    atual = e.cause;
  }
  return null;
}

/** SQLSTATE do Postgres (ex.: 23505), com ou sem o embrulho do Drizzle. */
export function pgErrorCode(err: unknown): string | undefined {
  return pgError(err)?.code as string | undefined;
}

/** Violação de índice único (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23505';
}

/**
 * O que pode ir para o log. Erro de banco: só código, constraint e tabela —
 * nunca a consulta, os parâmetros nem a mensagem (o Postgres repete o valor
 * recebido em mensagens como "invalid input syntax for type ..."). Outros
 * erros: nome e mensagem, que são do código e não de dado digitado.
 */
export function errorForLog(err: unknown): Record<string, unknown> {
  const pg = pgError(err);
  if (pg) {
    return {
      tipo: 'erro do banco',
      code: pg.code,
      constraint: typeof pg.constraint === 'string' ? pg.constraint : undefined,
      table: typeof pg.table === 'string' ? pg.table : undefined,
    };
  }
  if (err instanceof Error) {
    // Erro de consulta sem SQLSTATE (conexão caiu): a mensagem do embrulho tem os parâmetros.
    if (err.name === 'DrizzleQueryError' || err.message.startsWith('Failed query:')) {
      const causa = (err as { cause?: unknown }).cause;
      return { tipo: 'falha na consulta', causa: causa instanceof Error ? `${causa.name}: ${causa.message}`.slice(0, 200) : undefined };
    }
    return { tipo: err.name, mensagem: err.message.slice(0, 300), stack: err.stack?.split('\n').slice(0, 6).join('\n') };
  }
  return { tipo: typeof err };
}

/** Texto curto para gravar no banco (status da rotina): o mesmo filtro do log. */
export function errorSummary(err: unknown): string {
  const e = errorForLog(err);
  if (e.tipo === 'erro do banco') return `Erro do banco ${e.code}${e.constraint ? ` (${e.constraint})` : ''}`;
  if (e.tipo === 'falha na consulta') return `Falha na consulta ao banco${e.causa ? `: ${e.causa}` : ''}`;
  return `${e.tipo}: ${e.mensagem ?? ''}`.slice(0, 200);
}
