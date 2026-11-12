/**
 * Para onde ir depois do login.
 *
 * O `?next=` vem da URL, então é entrada de fora: só é aceito se for um
 * caminho relativo dentro do MESMO portal. Qualquer outra coisa (URL absoluta,
 * `//outro-site`, caminho de outro painel) cai no destino padrão — assim a
 * tela de login não vira trampolim para um site externo.
 */
export function safeNextPath(next: string | null | undefined, portalHome: string): string {
  if (!next) return portalHome;

  // Precisa ser caminho absoluto do próprio site. `//host` e `/\host` são
  // lidos por navegadores como URL protocolo-relativa — não servem.
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return portalHome;
  if (next.includes('\\') || /[\x00-\x1F]/.test(next)) return portalHome;

  // E precisa ser do portal em que a pessoa acabou de entrar: um login no
  // /gestor não redireciona para /admin.
  const dentroDoPortal = next === portalHome || next.startsWith(`${portalHome}/`) || next.startsWith(`${portalHome}?`);
  return dentroDoPortal ? next : portalHome;
}

/**
 * Navegação REAL (recarrega o documento) depois de autenticar.
 *
 * Não use `router.push()` aqui: o App Router serve a rota do cache do cliente,
 * que pode ter sido gravado enquanto a pessoa ainda não tinha sessão — o
 * middleware devolvia redirecionamento para o login e o clique em "Entrar"
 * parecia não fazer nada, até alguns F5 depois o cache expirar. Com uma
 * navegação de documento o middleware roda de novo já com o cookie novo.
 */
export function goAfterLogin(next: string | null | undefined, portalHome: string) {
  window.location.assign(safeNextPath(next, portalHome));
}
