'use client';

import { useEffect, useState } from 'react';

const CONSULTA = '(prefers-color-scheme: dark)';

/**
 * O aparelho está no modo escuro?
 *
 * Quase tudo troca de cor sozinho pelas variáveis do globals.css. Este hook
 * existe para o que não lê CSS: os gráficos do Recharts recebem a cor como
 * atributo do SVG (`fill="#E4E4E1"`), e atributo não resolve `var(--x)`.
 *
 * Acompanha a troca ao vivo — o iPhone muda sozinho ao anoitecer, com a tela
 * aberta. No servidor e no primeiro desenho devolve `false` (claro); o efeito
 * corrige no instante seguinte.
 */
export function useModoEscuro(): boolean {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    setEscuro(mq.matches);
    const aoMudar = (e: MediaQueryListEvent) => setEscuro(e.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  return escuro;
}
