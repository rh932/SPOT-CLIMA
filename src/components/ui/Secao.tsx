/**
 * Bloco de conteúdo da linguagem "Comanda": um `.card` (folha com filete
 * grosso no topo) com cabeçalho — índice em mono, título em serifa e apoio à
 * direita.
 *
 * O índice não é enfeite — numerar as seções dá à pessoa uma referência para
 * falar ("o 03 está zerado") e impõe uma ordem de leitura. Onde não fizer
 * sentido numerar, é só omitir.
 *
 * As classes moram em globals.css (`.card`, `.secao-*`) porque o mesmo desenho
 * aparece em página de servidor e de cliente, admin e gestor.
 *
 * `plano` tira a moldura do bloco, para quando a seção já está dentro de outro
 * bloco: um card dentro de um card vira caixa de sapato.
 */
export function Secao({
  indice,
  titulo,
  apoio,
  nota,
  acao,
  children,
  className,
  plano,
}: {
  /** Ex.: "01". Some quando não passado. */
  indice?: string;
  titulo: string;
  /** Linha curta de contexto à direita do título (período, origem do dado). */
  apoio?: React.ReactNode;
  /**
   * Linha fina logo abaixo do cabeçalho — a regra de anonimato, o total de
   * registros, o que limita a leitura do bloco.
   */
  nota?: React.ReactNode;
  /** Botão ou link alinhado ao fim do cabeçalho. */
  acao?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  plano?: boolean;
}) {
  return (
    <section className={`${plano ? 'card-plain' : 'card'} ${className ?? ''}`}>
      <div className={`secao-regua ${nota ? '!mb-2' : ''}`}>
        {indice && <span className="secao-indice">{indice}</span>}
        <h2 className="secao-titulo">{titulo}</h2>
        {apoio && <p className="secao-apoio">{apoio}</p>}
        {acao && <div className={apoio ? 'w-full sm:w-auto' : 'sm:ml-auto'}>{acao}</div>}
      </div>
      {nota && <p className="text-xs text-spot-gray-500 mb-4 max-w-2xl">{nota}</p>}
      {children}
    </section>
  );
}

/**
 * Régua de indicadores: os números lado a lado numa faixa só, separados por
 * filete, em duas ou quatro colunas conforme a largura. Para mais ou menos de
 * quatro indicadores, passe `className` com as colunas desejadas.
 */
export function ReguaIndicadores({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`stat-regua ${className ?? ''}`}>{children}</div>;
}
