/**
 * Formato do código de participação — sem dependência de servidor, para a
 * página pública da pesquisa poder conferir e ler o código do link.
 * A geração e o HMAC ficam em src/lib/accessCodes.ts.
 */

// Sem 0/O e 1/I/L: o código é lido de um papel e digitado no celular.
export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Maiúsculas, sem espaço nem hífen. */
export function normalizeAccessCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function isAccessCodeFormat(code: string): boolean {
  const n = normalizeAccessCode(code);
  return n.length === 8 && [...n].every((c) => ACCESS_CODE_ALPHABET.includes(c));
}

/** Como o código aparece para a pessoa: XXXX-XXXX. */
export function formatAccessCode(code: string): string {
  const n = normalizeAccessCode(code);
  return n.length === 8 ? `${n.slice(0, 4)}-${n.slice(4)}` : code.toUpperCase();
}

/** Lê o código de um fragmento "#codigo=XXXX-XXXX" (o QR do papelzinho). */
export function parseAccessCodeHash(hash: string): string | null {
  const m = /(?:^#|&)codigo=([^&]+)/.exec(hash);
  if (!m) return null;
  let code: string;
  try {
    code = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return isAccessCodeFormat(code) ? formatAccessCode(code) : null;
}
