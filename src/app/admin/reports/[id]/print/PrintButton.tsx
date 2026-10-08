'use client';

import { useEffect } from 'react';

export function PrintButton() {
  // Aberto pelo "Abrir e salvar PDF" (?imprimir=1): já chama a impressão,
  // depois de um respiro para os gráficos terminarem de desenhar.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('imprimir') !== '1') return;
    const t = window.setTimeout(() => window.print(), 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <button
      onClick={() => window.print()}
      className="print:hidden fixed top-4 right-4 btn-primary text-sm py-2 px-4 shadow-lg"
      type="button"
    >
      Imprimir / Salvar como PDF
    </button>
  );
}
