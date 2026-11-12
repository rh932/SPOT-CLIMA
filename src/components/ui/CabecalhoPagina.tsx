/**
 * Cabeçalho de página — a "placa" da tela: título em grotesca 800, grande
 * e apertado, e o subtítulo na voz do sistema (serifa itálica). O contraste
 * de peso, de escala e de família é o que faz a hierarquia, não caixa nem cor.
 * `rotulo` é a linha em mono acima do título (a área, o período, a unidade).
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
  rotulo,
  className,
}: {
  titulo: string;
  rotulo?: React.ReactNode;
  subtitulo?: React.ReactNode;
  /** Ação principal da tela, alinhada à direita no desktop. */
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className ?? ''}`}>
      <div className="min-w-0">
        {rotulo && <p className="rotulo-mono mb-2">{rotulo}</p>}
        <h1 className="titulo-pagina">
          {titulo}
        </h1>
        {subtitulo && <p className="voz text-xl sm:text-[1.375rem] leading-snug mt-3 max-w-2xl">{subtitulo}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}
