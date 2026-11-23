/**
 * Tabela vira cartão no celular, sem mexer na marcação de cada tela.
 *
 * No padrão Spot Integra, cada linha de tabela no celular é um cartão: o nome
 * em cima, os dados em pares rótulo/valor e a ação embaixo. O CSS faz o
 * desenho (src/styles/spot-extras.css, `table[data-cartoes]`); aqui só se
 * copia o texto de cada coluna do cabeçalho para um `data-rotulo` em cada
 * célula, e isso é refeito quando a tabela muda (filtro, busca, carregamento).
 *
 * Fica de fora toda tabela marcada com `data-sem-cartao` (mapa de calor,
 * grades largas que só fazem sentido como grade) e as sem cabeçalho.
 */
export function rotularTabelas(raiz: HTMLElement): () => void {
  const marcar = () => {
    raiz.querySelectorAll<HTMLTableElement>('table').forEach((t) => {
      if (t.hasAttribute('data-sem-cartao') || t.closest('[data-sem-cartao]')) return;
      const cab = t.querySelectorAll<HTMLTableCellElement>('thead th');
      if (cab.length === 0) return;
      const rotulos = Array.from(cab).map((c) => (c.textContent ?? '').trim());
      t.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
        let col = 0;
        tr.querySelectorAll<HTMLTableCellElement>('td').forEach((td) => {
          const r = rotulos[col] ?? '';
          if (td.getAttribute('data-rotulo') !== r) td.setAttribute('data-rotulo', r);
          col += td.colSpan || 1;
        });
      });
      if (!t.hasAttribute('data-cartoes')) t.setAttribute('data-cartoes', '');
    });
  };

  marcar();
  let quadro = 0;
  const obs = new MutationObserver(() => {
    // Agrupa várias mudanças seguidas num só passe por quadro.
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(marcar);
  });
  obs.observe(raiz, { childList: true, subtree: true });
  return () => {
    cancelAnimationFrame(quadro);
    obs.disconnect();
  };
}
