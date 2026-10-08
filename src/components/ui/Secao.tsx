/**
 * Cabeçalho de seção da linguagem "Boletim": índice em monoespaçada, título
 * em serifa caixa-baixa e um filete atravessando a largura.
 *
 * O índice não é enfeite — numerar as seções dá à pessoa uma referência para
 * falar ("o 03 está zerado") e impõe uma ordem de leitura que quatro cards
 * soltos não têm. Onde não fizer sentido numerar, é só omitir.
 *
 * As classes moram em globals.css (`.secao-*`) porque o mesmo desenho aparece
 * em página de servidor e de cliente, admin e gestor.
 */
export function Secao({
  indice,
  titulo,
  apoio,
  nota,
  acao,
  children,
  className,
}: {
  /** Ex.: "01". Some quando não passado. */
  indice?: string;
  titulo: string;
  /** Linha curta de contexto à direita do título (período, origem do dado). */
  apoio?: React.ReactNode;
  /**
   * Linha fina logo abaixo do filete — a regra de anonimato, o total de
   * registros, o que limita a leitura do bloco. Fica sob a régua, e não ao
   * lado do título, porque costuma ser uma frase inteira.
   */
  nota?: React.ReactNode;
  /** Botão ou link alinhado ao fim da régua. */
  acao?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 ${className ?? ''}`}>
      <div className="secao-regua">
        {indice && <span className="secao-indice">{indice}</span>}
        <h2 className="secao-titulo">{titulo}</h2>
        {apoio && <p className="secao-apoio">{apoio}</p>}
        {acao && <div className={apoio ? 'w-full sm:w-auto' : 'sm:ml-auto'}>{acao}</div>}
      </div>
      {nota && <p className="text-xs text-spot-gray-500 -mt-3 mb-4 max-w-2xl">{nota}</p>}
      {children}
    </section>
  );
}

/**
 * Régua de indicadores: os números dividem uma faixa só, separados por filete.
 *
 * Substitui a fileira de quatro cards iguais — que é a assinatura do painel
 * genérico e, pior, dava a cada número o mesmo peso visual de um card de
 * conteúdo. Aqui o número é o que salta; a moldura sumiu.
 *
 * No celular a régua empilha e o filete vira horizontal, sem virar quatro
 * caixinhas de novo.
 */
export function ReguaIndicadores({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`stat-regua ${className ?? ''}`}>{children}</div>;
}
