import type { RatingOption } from '@/data/evaluationBank';

// Exibição apenas: o gestor continua avaliando em Ótimo/Bom/Regular/Ruim e é
// isso que fica gravado — aqui a nota vira estrelas numa escala de 4 só para
// o resumo ficar mais fácil de ler.
const STARS_BY_RATING: Record<RatingOption, number> = { RUIM: 1, REGULAR: 2, BOM: 3, OTIMO: 4 };
const TOTAL_STARS = 4;

export function StarRating({ rating, showLabel = false }: { rating: RatingOption; showLabel?: boolean }) {
  const filled = STARS_BY_RATING[rating];
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={`${filled} de ${TOTAL_STARS}`}>
      <span className="text-sm leading-none tracking-tight" aria-hidden>
        {Array.from({ length: TOTAL_STARS }, (_, i) => (
          <span key={i} className={i < filled ? 'text-spot-yellow' : 'text-spot-gray-300'}>
            ★
          </span>
        ))}
      </span>
      <span className="sr-only">{filled} de {TOTAL_STARS} estrelas</span>
      {showLabel && <span className="text-xs text-spot-gray-500">{filled}/{TOTAL_STARS}</span>}
    </span>
  );
}
