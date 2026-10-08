'use client';

export function PrintButton() {
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
