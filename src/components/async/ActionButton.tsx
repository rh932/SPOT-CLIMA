'use client';

import { Spinner } from './states';

/**
 * Botão que se explica enquanto trabalha.
 *
 * Três coisas que faltavam nos botões do sistema e faziam a tela parecer
 * travada:
 *  - `aria-busy`, para o leitor de tela saber que a ação está em curso;
 *  - o spinner, porque só trocar "Enviar" por "Enviando..." não mostra que
 *    algo continua acontecendo numa espera de 10 segundos;
 *  - largura preservada: o texto pendente entra no lugar do normal e o botão
 *    não encolhe no meio do clique.
 */
export function ActionButton({
  pending = false,
  pendingLabel,
  children,
  className = 'btn-primary',
  disabled,
  ...rest
}: {
  pending?: boolean;
  pendingLabel?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={className} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
