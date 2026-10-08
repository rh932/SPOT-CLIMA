'use client';

import { useEffect } from 'react';

/*
 * Erro inesperado ao desenhar uma tela. Sem este arquivo o Next mostrava
 * "Application error: a client-side exception has occurred" em inglês, sem
 * botão — no celular a pessoa fechava o app achando que o sistema tinha caído.
 *
 * `reset()` tenta desenhar a tela de novo sem recarregar a página, e resolve
 * a maioria dos casos (falha de rede passageira no meio da navegação).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-dvh bg-spot-cream flex items-center px-4 py-10">
      <div role="alert" className="w-full max-w-md mx-auto">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-spot-gray-500">Falha ao abrir a tela</p>
        <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-spot-gray-900 mt-3 pb-5 border-b border-spot-gray-300">
          Não conseguimos mostrar esta página
        </h1>
        <p className="text-sm text-spot-gray-600 leading-relaxed mt-5 max-w-prose">
          Nada do que você já salvou foi perdido. Tente de novo; se continuar, confira a conexão ou avise o RH.
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] text-spot-gray-500 mt-3">
            Código para o suporte: <span className="select-all">{error.digest}</span>
          </p>
        )}
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button type="button" className="btn-primary" onClick={reset}>Tentar de novo</button>
          <button type="button" className="btn-ghost" onClick={() => window.history.back()}>Voltar</button>
        </div>
      </div>
    </main>
  );
}
