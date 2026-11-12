/**
 * Uma ficha com o nome da pessoa sai de onde a ação aconteceu e viaja até a
 * aba do menu para onde ela foi (ex.: "Desligados"). Mostra o destino em vez
 * de a pessoa simplesmente sumir das listas — quem registrou a saída vê onde
 * achá-la depois.
 *
 * É enfeite: se não houver aba visível, origem, ou se o aparelho pedir menos
 * movimento, não faz nada. Nunca atrasa nem bloqueia a ação.
 *
 * Usa a Web Animations API direto no DOM (a ficha viajante não pertence a
 * nenhuma tela: nasce e morre em `document.body`), só com transform e
 * opacidade.
 */
export function voarParaAba({ origem, href, rotulo }: { origem: DOMRect | null; href: string; rotulo: string }) {
  if (typeof window === 'undefined' || !origem) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Faixa de abas (celular) e barra lateral (computador) têm o mesmo link;
  // vale o que está na tela.
  const aba = Array.from(document.querySelectorAll<HTMLElement>(`a[href="${href}"]`))
    .find((el) => el.getClientRects().length > 0);
  if (!aba || typeof aba.animate !== 'function') return;

  // No celular a aba pode estar fora da faixa rolável: traz para a vista antes de medir.
  aba.scrollIntoView({ block: 'nearest', inline: 'center' });
  const alvo = aba.getBoundingClientRect();

  const largura = Math.min(origem.width, 320);
  const ficha = document.createElement('div');
  ficha.setAttribute('aria-hidden', 'true');
  ficha.className = 'fixed z-[60] pointer-events-none overflow-hidden rounded-xl2 border-[1.5px] border-spot-gray-300 bg-spot-white py-3 pl-5 pr-3.5 text-base font-semibold text-spot-gray-900 truncate print:hidden';
  ficha.style.left = `${origem.left}px`;
  ficha.style.top = `${origem.top}px`;
  ficha.style.width = `${largura}px`;
  ficha.style.transformOrigin = 'center';
  const aba7 = document.createElement('span');
  aba7.className = 'absolute inset-y-0 left-0 w-[7px] bg-spot-gray-300';
  ficha.append(aba7, document.createTextNode(rotulo));
  document.body.appendChild(ficha);

  const altura = ficha.getBoundingClientRect().height;
  const dx = alvo.left + alvo.width / 2 - (origem.left + largura / 2);
  const dy = alvo.top + alvo.height / 2 - (origem.top + altura / 2);

  const voo = ficha.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      // Primeiro se solta da página, depois vai.
      { transform: 'translate(0, -10px) scale(1.03)', opacity: 1, offset: 0.18 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.15 },
    ],
    { duration: 620, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', fill: 'forwards' },
  );

  const fim = () => {
    ficha.remove();
    // A aba "recebe" a ficha.
    aba.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  };
  voo.onfinish = fim;
  voo.oncancel = () => ficha.remove();
}
