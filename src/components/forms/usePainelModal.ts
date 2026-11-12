'use client';

import { useEffect, useRef } from 'react';

/**
 * Comportamento de teclado de um painel sobreposto (modal, folha, popover).
 *
 * O QUE ESTAVA ERRADO
 *
 * O sistema tem 14 painéis sobrepostos e só 3 fechavam com Esc. Nenhum prendia
 * o foco. Medido na bancada, com o menu do celular ABERTO:
 *
 *   controlesAtrasDoMenuAindaTabulaveis: 6
 *   exemplos: 'Excluir o setor "Salão" definitivamente', 'Desativar o setor...'
 *
 * Ou seja: o overlay escuro impede o CLIQUE, mas não o Tab. Quem navega por
 * teclado atravessa o menu e chega, às cegas, num botão destrutivo que está
 * visualmente coberto — e o Enter dispara. Para quem usa leitor de tela é pior:
 * sem `role="dialog"` nada anuncia que um painel abriu, e a leitura continua
 * pela página de trás como se nada tivesse acontecido.
 *
 * O QUE ESTE HOOK FAZ
 *
 *  1. Esc fecha — o gesto que todo mundo tenta primeiro.
 *  2. O foco entra no painel ao abrir, para o leitor de tela anunciar o que
 *     apareceu em vez de continuar onde estava.
 *  3. O foco fica preso enquanto o painel está aberto: Tab no último volta ao
 *     primeiro, Shift+Tab no primeiro vai ao último.
 *  4. Ao fechar, o foco VOLTA para o controle que abriu o painel — senão ele
 *     cai no início da página e a pessoa perde o lugar onde estava.
 *
 * Não mexe em aparência nenhuma: é só comportamento.
 */

const FOCAVEIS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function usePainelModal<T extends HTMLElement>({
  aberto,
  aoFechar,
  /** `false` enquanto uma gravação está em curso — fechar no meio perderia o envio. */
  podeFechar = true,
}: {
  aberto: boolean;
  aoFechar: () => void;
  podeFechar?: boolean;
}) {
  const painelRef = useRef<T>(null);
  const gatilhoRef = useRef<HTMLElement | null>(null);

  // Guardado num ref para o efeito não reiniciar a cada render do pai — o
  // callback quase sempre é uma arrow function recriada.
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;
  const podeFecharRef = useRef(podeFechar);
  podeFecharRef.current = podeFechar;

  useEffect(() => {
    if (!aberto) return;

    // Quem estava com o foco antes de abrir — é para cá que ele volta.
    gatilhoRef.current = document.activeElement as HTMLElement | null;

    const painel = painelRef.current;
    if (painel) {
      const primeiro = painel.querySelector<HTMLElement>(FOCAVEIS);
      if (primeiro) {
        primeiro.focus();
      } else {
        // Painel sem nada focável (um aviso, por exemplo): o próprio painel
        // recebe o foco para ser anunciado, sem virar parada de tabulação.
        painel.setAttribute('tabindex', '-1');
        painel.focus();
      }
    }

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!podeFecharRef.current) return;
        e.stopPropagation();
        fecharRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const atual = painelRef.current;
      if (!atual) return;
      const focaveis = Array.from(atual.querySelectorAll<HTMLElement>(FOCAVEIS))
        .filter((el) => el.getBoundingClientRect().width > 0 || el.getBoundingClientRect().height > 0);
      if (focaveis.length === 0) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;

      // Fora do painel (aconteceu de o foco escapar): traz de volta.
      if (!atual.contains(ativo)) {
        e.preventDefault();
        primeiro.focus();
        return;
      }
      if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && ativo === primeiro) {
        e.preventDefault();
        ultimo.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      // `isConnected`: se o gatilho saiu do DOM (a linha da lista foi excluída),
      // devolver o foco a ele não faria nada e o foco cairia no <body>.
      const gatilho = gatilhoRef.current;
      if (gatilho?.isConnected) gatilho.focus();
    };
  }, [aberto]);

  return painelRef;
}
