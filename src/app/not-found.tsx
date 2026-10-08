import Link from 'next/link';

/*
 * Página não encontrada. Antes caía no 404 padrão do Next — em inglês, sem
 * marca e sem nenhum caminho de volta. Quem chega aqui quase sempre veio de um
 * link velho (aviso por push de uma avaliação já apagada, favorito de uma tela
 * que mudou de endereço), então a saída importa mais que a explicação.
 *
 * Fica fora dos painéis, mas as cores são as mesmas variáveis do globals.css —
 * acompanha o modo escuro como qualquer outra tela.
 */
export default function NotFound() {
  return (
    <main className="min-h-dvh bg-spot-cream flex items-center px-4 py-10">
      <div className="w-full max-w-md mx-auto">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-spot-gray-500">Erro 404</p>
        <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-spot-gray-900 mt-3 pb-5 border-b border-spot-gray-300">
          Esta página não existe
        </h1>
        <p className="text-sm text-spot-gray-600 leading-relaxed mt-5 max-w-prose">
          O endereço pode ter mudado ou o registro foi excluído. Se você chegou por um aviso, o assunto dele
          provavelmente já foi resolvido.
        </p>
        <nav aria-label="Para onde ir" className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link href="/gestor" className="btn-secondary">Painel do gestor</Link>
          <Link href="/admin" className="btn-ghost">Painel do RH</Link>
        </nav>
        <p className="text-xs text-spot-gray-500 mt-6">
          Veio responder à pesquisa de clima?{' '}
          <Link href="/survey" className="underline underline-offset-2 decoration-spot-yellow decoration-2 hover:text-spot-gray-900">
            Abrir a pesquisa
          </Link>
        </p>
      </div>
    </main>
  );
}
