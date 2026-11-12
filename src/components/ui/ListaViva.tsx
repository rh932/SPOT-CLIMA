'use client';

import { Children, isValidElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * Lista que se reorganiza em vez de piscar: quando o filtro, a busca ou a
 * ordem mudam, quem continua na lista desliza até a nova posição, quem sai
 * some rápido e quem entra aparece. Dá para acompanhar com o olho para onde
 * foi a pessoa que se estava olhando.
 *
 * Cada filho precisa de `key` estável (o id do registro) — é por ela que a
 * lista sabe quem é quem entre um filtro e outro.
 *
 * Só anima posição (`layout="position"`), nunca tamanho: transform e
 * opacidade, sem mexer em layout a cada quadro. O transform some ao fim do
 * movimento, então não prende `position: fixed` de descendente (a armadilha
 * do fadeInUp descrita no MASTER.md).
 *
 * Acima de LIMITE itens a lista troca seca: medir e mover centenas de linhas
 * a cada tecla da busca custa mais do que comunica.
 *
 * Com "reduzir movimento" ligado, o MotionConfig dos layouts desliga o
 * deslize e sobra só a troca de opacidade.
 */
const LIMITE = 80;
const MOLA = { type: 'spring', stiffness: 480, damping: 40, mass: 0.8 } as const;

export function ListaViva({
  children,
  className,
  classeItem,
}: {
  children: React.ReactNode;
  className?: string;
  /** Classe do invólucro de cada item (ex.: o filete entre linhas). */
  classeItem?: string;
}) {
  const itens = Children.toArray(children).filter(isValidElement);

  if (itens.length > LIMITE) {
    return (
      <div className={className}>
        {itens.map((item) => <div key={item.key} className={classeItem}>{item}</div>)}
      </div>
    );
  }

  return (
    // `relative`: quem está saindo fica absoluto (popLayout) e precisa de um
    // pai posicionado para não pular para o canto da página.
    <div className={`relative ${className ?? ''}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {itens.map((item) => (
          <motion.div
            key={item.key}
            layout="position"
            className={classeItem}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            // Sair é mais rápido que entrar.
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={MOLA}
          >
            {item}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
