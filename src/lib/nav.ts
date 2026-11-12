/**
 * Qual item do menu está ativo para o caminho atual.
 *
 * Vence o item MAIS ESPECÍFICO: em `/gestor/treinamento/historico` acende
 * "Histórico de treinamentos", não "Treinamento". Comparar com um simples
 * `startsWith` deixava os dois acesos ao mesmo tempo, e quem está no celular
 * não tinha como saber em qual tela estava.
 *
 * A barra final é obrigatória na comparação (`/admin/units/` e não
 * `/admin/unit`) para que `/admin/unidades-x` não acenda `/admin/unidades`.
 */
export function activeNavHref(pathname: string | null | undefined, hrefs: string[]): string | null {
  if (!pathname) return null;
  return (
    hrefs
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

/**
 * Sai da sessão com navegação REAL, não `router.push()`.
 *
 * Pelo mesmo motivo do login (ver `src/lib/loginRedirect.ts`): o App Router
 * guarda as rotas já visitadas em cache no cliente, e depois de sair elas
 * continuariam sendo servidas de lá — a pessoa veria o painel antigo até o
 * cache expirar. Uma navegação de documento joga fora esse cache inteiro.
 */
export async function logoutAndLeave(portal: 'admin' | 'gestor') {
  try {
    await fetch(`/api/auth/logout?portal=${portal}`, { method: 'POST', cache: 'no-store' });
  } finally {
    window.location.assign(`/${portal}/login`);
  }
}
