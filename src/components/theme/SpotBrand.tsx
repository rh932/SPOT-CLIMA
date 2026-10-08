'use client';

/**
 * Assinatura da marca: o logo (que já traz a palavra "Spot" desenhada) com
 * "clima" logo abaixo. Não repetir "SPOT CLIMA" escrito ao lado do logo —
 * seria dizer a mesma coisa duas vezes.
 *
 * Em `row`, o "clima" fica sob o logo num bloco compacto (útil em barras de
 * topo estreitas); em `stack`, tudo centralizado.
 */

type Size = 'sm' | 'md' | 'lg';

const LOGO_SIZE: Record<Size, string> = {
  sm: 'h-7 w-auto',
  md: 'h-9 w-auto',
  lg: 'h-14 sm:h-16 w-auto',
};

const WORD_SIZE: Record<Size, string> = {
  sm: 'text-[10px] tracking-[0.35em]',
  md: 'text-xs tracking-[0.38em]',
  lg: 'text-sm sm:text-base tracking-[0.42em]',
};

export function SpotBrand({
  size = 'md',
  layout = 'stack',
  className = '',
}: {
  size?: Size;
  layout?: 'stack' | 'row';
  className?: string;
}) {
  const logoClass = `${LOGO_SIZE[size]} shrink-0 object-contain`;

  return (
    <span
      className={`inline-flex ${layout === 'stack' ? 'flex-col items-center' : 'flex-col items-start'} leading-none ${className}`}
    >
      {/* O logo é laranja sobre fundo transparente: lê bem no claro e no escuro. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/spot-logo.png" alt="Spot" className={logoClass} />
      <span className={`mt-1 font-semibold uppercase ${WORD_SIZE[size]}`}>clima</span>
    </span>
  );
}
