'use client';

import { motion, type Variants } from 'motion/react';

/**
 * Entrada em cascata: cada `<Surge>` dentro de uma `<Cascata>` chega um depois
 * do outro. A ordem é a do DOM, então a leitura que a página propõe
 * (indicadores → gráficos → pontas → leitura) é a mesma ordem em que as coisas
 * chegam.
 *
 * O movimento é o da capa do login (LoginCover), para o painel ter a mesma
 * mão de quem acabou de entrar:
 *   - `deslizar` (padrão) = `animate-slideInLeft`: vem 14px da esquerda em
 *     0,45s com saída suave;
 *   - `carimbo` = `animate-stampIn`: o cartão do título do login, que bate
 *     com um leve exagero e um giro mínimo. Um por tela, no que importa mais.
 *
 * Uma `<Cascata>` pode conter outra: a de dentro só começa quando chega a vez
 * dela na de fora — é assim que os quatro indicadores entram um a um sem
 * empurrar o resto da página para depois.
 *
 * Só toca na montagem. Se o conteúdo muda depois (trocar a pesquisa em foco),
 * nada entra de novo: quem anima a troca são os próprios números.
 *
 * Com "reduzir movimento" ligado, o MotionConfig dos layouts tira o
 * deslocamento e sobra só o fade.
 */
const cascata = (passo: number): Variants => ({
  oculto: {},
  visivel: { transition: { staggerChildren: passo } },
});

const ENTRADA = {
  deslizar: {
    oculto: { opacity: 0, x: -14 },
    visivel: { opacity: 1, x: 0, transition: { duration: 0.45, ease: 'easeOut' } },
  },
  // Mesmos quadros do keyframe stampIn do tailwind.config.ts.
  carimbo: {
    oculto: { opacity: 0, scale: 0.92, rotate: -1.2 },
    visivel: {
      opacity: [0, 1, 1],
      scale: [0.92, 1.02, 1],
      rotate: [-1.2, 0.3, 0],
      transition: { duration: 0.5, times: [0, 0.7, 1], ease: [0.34, 1.4, 0.64, 1] },
    },
  },
} satisfies Record<string, Variants>;

export function Cascata({
  children,
  className,
  passo = 0.09,
  raiz,
  'aria-busy': ocupado,
}: {
  children: React.ReactNode;
  className?: string;
  'aria-busy'?: boolean;
  /** Intervalo entre um filho e o próximo, em segundos. */
  passo?: number;
  /** Só a cascata de fora dispara a animação; as de dentro herdam a vez. */
  raiz?: boolean;
}) {
  return (
    <motion.div
      className={className}
      aria-busy={ocupado}
      variants={cascata(passo)}
      {...(raiz ? { initial: 'oculto', animate: 'visivel' } : {})}
    >
      {children}
    </motion.div>
  );
}

export function Surge({
  children,
  className,
  como = 'deslizar',
}: {
  children: React.ReactNode;
  className?: string;
  como?: keyof typeof ENTRADA;
}) {
  return (
    <motion.div className={className} variants={ENTRADA[como]}>
      {children}
    </motion.div>
  );
}
