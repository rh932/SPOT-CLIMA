'use client';

/**
 * Os quatro desfechos de qualquer carregamento — carregando, erro, vazio e
 * conteúdo — num lugar só, para que toda tela trate os quatro.
 *
 * O defeito que isto conserta aparecia em 15 telas: o `load()` não tinha
 * `.catch`, então uma API fora do ar caía no MESMO estado de lista vazia. O RH
 * abria "Avaliação de Experiência" durante uma falha e lia "Nenhum funcionário
 * cadastrado ainda" — a tela dizia que os dados não existem quando o que houve
 * foi uma falha de rede.
 */

import type { ReactNode } from 'react';

/**
 * Anúncio para leitor de tela do que a tela está fazendo.
 *
 * `aria-live="polite"` espera a pessoa terminar a frase atual antes de falar —
 * o certo para "carregando"/"pronto". Erro usa `assertive` porque interrompe
 * uma ação que a pessoa está esperando.
 */
export function LiveStatus({ children, urgente = false }: { children: ReactNode; urgente?: boolean }) {
  return (
    <p
      role={urgente ? 'alert' : 'status'}
      aria-live={urgente ? 'assertive' : 'polite'}
      className="sr-only"
    >
      {children}
    </p>
  );
}

/**
 * Spinner de botão.
 *
 * `motion-reduce:hidden`: com a preferência por menos movimento, a regra global
 * zera a duração da animação e sobraria um anel quebrado parado na tela — um
 * artefato, não uma informação. Quem pediu menos movimento continua sabendo que
 * a ação está em curso pelo RÓTULO do botão ("Enviando...") e pelo `aria-busy`,
 * que é o sinal de verdade; o spinner sempre foi só o enfeite.
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:hidden ${className}`}
    />
  );
}

/**
 * Erro com saída. Uma mensagem vermelha sem botão obriga a pessoa a adivinhar
 * que recarregar resolve — no celular, quase ninguém adivinha.
 */
export function ErrorState({
  message,
  onRetry,
  retrying = false,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      /* Faixa marcada na lateral em vez de card vermelho claro: o erro precisa
         saltar sem transformar metade da tela num retangulo colorido. */
      className={`bg-spot-white border-l-[3px] border-spot-danger pl-4 pr-4 flex flex-col items-start gap-3 ${compact ? 'py-3' : 'py-5'}`}
    >
      <div>
        <p className="font-semibold text-spot-dangerDark text-sm">Não foi possível carregar.</p>
        <p className="text-sm text-spot-gray-700 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn-ghost text-sm" onClick={onRetry} disabled={retrying}>
          {retrying && <Spinner />}
          {retrying ? 'Tentando...' : 'Tentar de novo'}
        </button>
      )}
    </div>
  );
}

/** Estado vazio de verdade — só aparece quando a API respondeu e não veio nada. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-y border-spot-gray-200 text-center py-12 text-spot-gray-500 text-sm flex flex-col items-center gap-3">
      <div>{children}</div>
      {action}
    </div>
  );
}

/**
 * Máquina de estados de uma tela que carrega dados.
 *
 * Ordem importa: erro ANTES de vazio. Era exatamente a inversão disso que
 * fazia a falha se passar por "não há registros".
 */
export function AsyncSection({
  loading,
  error,
  onRetry,
  retrying,
  empty,
  skeleton,
  emptyState,
  children,
  rotulo = 'os dados',
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  retrying?: boolean;
  empty?: boolean;
  skeleton: ReactNode;
  emptyState?: ReactNode;
  children: ReactNode;
  /** Usado no anúncio em áudio: "Carregando os colaboradores...". */
  rotulo?: string;
}) {
  if (loading) {
    return (
      <div aria-busy="true">
        <LiveStatus>Carregando {rotulo}...</LiveStatus>
        {skeleton}
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={onRetry} retrying={retrying} />;
  if (empty && emptyState) return <>{emptyState}</>;
  return <>{children}</>;
}

/**
 * Faixa discreta de "atualizando" para uma recarga em segundo plano, quando os
 * dados antigos continuam na tela. Sem isto, salvar algo e voltar para a lista
 * mostrava o valor velho por segundos, sem nenhum sinal de que ia mudar.
 */
export function RefreshingBar({ visible, texto = 'Atualizando...' }: { visible: boolean; texto?: string }) {
  if (!visible) return null;
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-spot-gray-500">
      <Spinner className="h-3 w-3" />
      {texto}
    </p>
  );
}
