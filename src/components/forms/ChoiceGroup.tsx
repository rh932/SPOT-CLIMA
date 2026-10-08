'use client';

/**
 * Grupo de escolha única com a aparência de botões.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * As notas do sistema — Likert e escala da pesquisa, Ótimo/Bom/Regular/Ruim da
 * avaliação, os critérios do treinamento — eram `<button>` comum, e o ÚNICO
 * sinal de "esta é a minha resposta" era a cor de fundo. Medido na tela de
 * avaliação: depois de escolher "Ótimo", o botão continuava com
 * `role=button`, `aria-pressed=null` e `aria-checked=null`; a única diferença
 * era `background-color: rgb(11,11,11)`.
 *
 * Na prática isso significa:
 *  - quem usa leitor de tela ouve "Ótimo, botão" ANTES e DEPOIS de escolher —
 *    não dá para conferir a ficha antes de enviar, nem descobrir o que já foi
 *    respondido ao voltar uma página;
 *  - quem não distingue bem as cores (ou usa alto contraste, ou está no sol da
 *    calçada com o celular) fica na mesma situação;
 *  - os botões não formavam grupo: tabulando, ouvia-se "Ruim Regular Bom Ótimo
 *    Ruim Regular Bom Ótimo..." sem saber de qual pergunta era cada série.
 *
 * POR QUE RADIO DE VERDADE E NÃO `aria-pressed`
 *
 * São opções mutuamente exclusivas, que é exatamente o que um radiogroup
 * descreve. O input nativo dá de graça o que teria de ser reimplementado à
 * mão: navegação por setas, um só ponto de tabulação por grupo, o anúncio
 * "selecionado, 3 de 4" e o comportamento correto em formulário. O app já
 * usava esse padrão em SINGLE_CHOICE da pesquisa e na folha de cor — aqui só
 * se estende o acerto para o resto.
 *
 * COMO A APARÊNCIA É PRESERVADA
 *
 * O input fica `sr-only` e quem pinta é o `<span>` irmão, que recebe as MESMAS
 * classes de antes — a tela não muda um pixel. O `peer-focus-visible` devolve
 * o anel de foco que se perderia ao esconder o input: sem isso, navegar por
 * teclado deixaria de mostrar onde se está.
 */

import type { ReactNode } from 'react';

export function ChoiceGroup({
  legenda,
  descricao,
  children,
  className = '',
  invalido = false,
  idDescricao,
}: {
  /** O enunciado. Vira `<legend>` visível — é o texto que já existia acima do grupo. */
  legenda: ReactNode;
  /** Texto auxiliar opcional, anunciado junto pela `aria-describedby`. */
  descricao?: ReactNode;
  children: ReactNode;
  className?: string;
  invalido?: boolean;
  idDescricao?: string;
}) {
  return (
    // `fieldset` + `legend` é o que amarra as opções ao enunciado: o leitor de
    // tela repete a pergunta ao entrar no grupo, então "Bom" deixa de ser uma
    // palavra solta. `min-w-0` porque fieldset tem largura mínima automática
    // que estoura grid/flex.
    <fieldset className={`min-w-0 border-0 p-0 m-0 ${className}`} aria-invalid={invalido || undefined} aria-describedby={idDescricao}>
      <legend className="contents">{legenda}</legend>
      {descricao}
      {children}
    </fieldset>
  );
}

export function ChoiceOption({
  name,
  value,
  checked,
  onChange,
  className,
  children,
  disabled = false,
  wrapperClassName = '',
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  /** As mesmas classes visuais de antes — a aparência não muda. */
  className: string;
  children: ReactNode;
  disabled?: boolean;
  wrapperClassName?: string;
}) {
  return (
    <label className={`block cursor-pointer ${disabled ? 'cursor-not-allowed' : ''} ${wrapperClassName}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={`${className} peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-spot-yellow peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-spot-white`}
      >
        {children}
      </span>
    </label>
  );
}

/**
 * Botão de alternância de verdade (filtro, seleção múltipla, troca de visão).
 *
 * Diferente do grupo acima: aqui as opções NÃO são exclusivas (ou a alternância
 * é um liga/desliga), então `aria-pressed` é o certo — é ele que faz o leitor
 * de tela dizer "pressionado" / "não pressionado". Sem isso, os filtros por cor
 * e a seleção de pesquisas do comparativo só se distinguiam pelo fundo escuro.
 */
export function ToggleChip({
  pressed,
  onClick,
  className,
  children,
  rotulo,
  ...rest
}: {
  pressed: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
  /** Nome acessível completo, quando o texto visível é curto demais sozinho. */
  rotulo?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'className'>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={rotulo}
      onClick={onClick}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}
