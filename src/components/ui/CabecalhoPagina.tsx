/**
 * Cabeçalho de página — o título é o único lugar da tela onde a serifa aparece
 * em tamanho grande, e é o que dá o tom de boletim antes de qualquer conteúdo.
 *
 * Substitui os `<h1 className="text-2xl font-bold">` soltos que cada tela
 * tinha escrito à mão. Estavam todos ligeiramente diferentes entre si (umas
 * com subtítulo em `text-sm`, outras em `text-xs`, umas com margem, outras
 * não) — a inconsistência que ninguém nota uma tela por vez e que todo mundo
 * sente ao percorrer dez.
 */
export function CabecalhoPagina({
  titulo,
  subtitulo,
  acao,
  className,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  /** Ação principal da tela, alinhada à direita no desktop. */
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className ?? ''}`}>
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-spot-gray-900">
          {titulo}
        </h1>
        {subtitulo && <p className="text-sm text-spot-gray-600 mt-2 max-w-2xl">{subtitulo}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}
