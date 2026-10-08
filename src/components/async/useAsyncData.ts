'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carregamento de dados com os quatro desfechos sempre tratados.
 *
 * O padrão antigo, repetido em 15 telas, era:
 *
 *     useEffect(() => { load().finally(() => setLoading(false)); }, []);
 *
 * Sem `.catch`: a promessa rejeitava no console e a tela caía no estado vazio.
 * Aqui o erro é um estado de primeira classe, com `reload()` para a pessoa
 * tentar de novo sem recarregar a página inteira.
 *
 * `reloading` distingue a PRIMEIRA carga (tela vazia → esqueleto) de uma
 * recarga com dados já na tela (mantém o conteúdo e mostra "Atualizando...").
 * Trocar a lista por um esqueleto a cada recarga faz a tela piscar e perde a
 * posição de rolagem.
 */
export function useAsyncData<T>(
  carregar: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  opcoes: { mensagemPadrao?: string; ativo?: boolean } = {},
) {
  const { mensagemPadrao = 'Erro ao carregar.', ativo = true } = opcoes;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(ativo);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guarda a função mais recente sem entrar nas dependências do efeito — senão
  // uma arrow function inline recriada a cada render dispara fetch infinito.
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  const temDados = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const executar = useCallback(async () => {
    // Cancela a busca anterior: sem isto, uma resposta lenta antiga pode chegar
    // depois da nova e sobrescrever a tela com dados velhos.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (temDados.current) setReloading(true); else setLoading(true);
    setError(null);
    try {
      const resultado = await carregarRef.current(controller.signal);
      if (controller.signal.aborted) return;
      setData(resultado);
      temDados.current = true;
    } catch (e) {
      if (controller.signal.aborted || (e as Error)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : mensagemPadrao);
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setReloading(false); }
    }
  }, [mensagemPadrao]);

  useEffect(() => {
    if (!ativo) { setLoading(false); return; }
    executar();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executar, ativo, ...deps]);

  return { data, loading, reloading, error, reload: executar, setData };
}

/**
 * Uma ação assíncrona (salvar, excluir, publicar) com estado de pendência e de
 * erro — para o botão poder se desabilitar e se explicar sozinho.
 *
 * `pendingKey` permite marcar QUAL item da lista está ocupado, em vez de
 * travar a lista inteira: o gestor clica em "Desativar" na terceira linha e é
 * só aquela linha que fica ocupada.
 */
export function useAsyncAction(mensagemPadrao = 'Não foi possível concluir a ação.') {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(acao: () => Promise<T>, key = 'default'): Promise<T | undefined> => {
    setPendingKey(key);
    setError(null);
    try {
      return await acao();
    } catch (e) {
      setError(e instanceof Error ? e.message : mensagemPadrao);
      return undefined;
    } finally {
      setPendingKey(null);
    }
  }, [mensagemPadrao]);

  return {
    run,
    pendingKey,
    pending: pendingKey !== null,
    isPending: (key = 'default') => pendingKey === key,
    error,
    setError,
    clearError: () => setError(null),
  };
}
