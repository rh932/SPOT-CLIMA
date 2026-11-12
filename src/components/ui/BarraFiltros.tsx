'use client';

import { useEffect, useId, useState } from 'react';
import { usePainelModal } from '@/components/forms/usePainelModal';

/** Rótulo dos campos dentro da folha de filtros (mesmo estilo mono do resto do painel). */
export const ROTULO_FILTRO = 'font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500';

/**
 * Barra de busca + botão "Filtros" que abre uma folha com todas as opções.
 *
 * Pensada para o celular, onde o gestor usa o painel quase todo: na tela só
 * ficam a busca, o botão (com a quantidade de filtros ligados) e uma linha com
 * o total encontrado. Os seletores ficam dentro da folha, que sobe de baixo no
 * celular e vira um painel central no computador. Os filtros valem na hora —
 * o botão do rodapé só fecha a folha mostrando quantos resultados há.
 *
 * Os campos entram como `children`; quem usa decide quais filtros existem.
 */
export function BarraFiltros({
  busca, onBusca, placeholder = 'Buscar...', rotuloBusca = 'Buscar',
  ativos, onLimpar, resumo, totalResultados, children,
}: {
  busca: string;
  onBusca: (v: string) => void;
  placeholder?: string;
  rotuloBusca?: string;
  /** Quantos filtros estão ligados (sem contar a busca, que já está à vista). */
  ativos: number;
  onLimpar: () => void;
  /** Linha de apoio sob a barra (ex.: "4 colaboradores encontrados"). */
  resumo?: string;
  /** Número do botão de fechar a folha ("Ver 12 resultados"). */
  totalResultados?: number;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  const titulo = useId();
  const folhaRef = usePainelModal<HTMLDivElement>({ aberto: aberta, aoFechar: () => setAberta(false) });

  // Com a folha aberta a página de trás não rola: no celular o dedo rolaria o fundo.
  useEffect(() => {
    if (!aberta) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, [aberta]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label className="block flex-1 min-w-0">
          <span className="sr-only">{rotuloBusca}</span>
          <input
            type="search"
            className="input"
            placeholder={placeholder}
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => setAberta(true)}
          aria-haspopup="dialog"
          aria-expanded={aberta}
          className={`shrink-0 inline-flex items-center gap-2 min-h-12 px-4 rounded-btn border-[1.5px] text-sm font-semibold transition-colors ${
            ativos > 0 ? 'border-spot-gray-900 bg-spot-black text-spot-onBlack' : 'border-spot-gray-900 bg-spot-white text-spot-gray-900 hover:bg-spot-cream'
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filtros
          {ativos > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-spot-yellow text-spot-onYellow text-[11px] font-bold">
              {ativos}
            </span>
          )}
        </button>
      </div>

      {(resumo || ativos > 0) && (
        <div className="flex items-center justify-between gap-3">
          {resumo && <p role="status" aria-live="polite" className="text-xs text-spot-gray-600">{resumo}</p>}
          {ativos > 0 && (
            <button type="button" onClick={onLimpar} className="text-xs underline underline-offset-4 text-spot-gray-800 min-h-9 px-1">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {aberta && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center animate-fadeIn"
          onClick={(e) => { if (e.target === e.currentTarget) setAberta(false); }}
        >
          <div
            ref={folhaRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titulo}
            className="bg-spot-cream w-full sm:max-w-lg rounded-t-xl2 sm:rounded-xl2 flex flex-col max-h-[88dvh] shadow-xl"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-spot-gray-200 shrink-0">
              <h2 id={titulo} className="font-sans text-lg font-extrabold tracking-tight">Filtros</h2>
              <button
                type="button"
                onClick={() => setAberta(false)}
                aria-label="Fechar filtros"
                className="inline-flex items-center justify-center min-h-11 min-w-11 -mr-2 text-spot-gray-600 hover:text-spot-gray-900"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {children}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-spot-gray-200 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" className="btn-ghost flex-1" onClick={onLimpar} disabled={ativos === 0}>Limpar</button>
              <button type="button" className="btn-primary flex-[2]" onClick={() => setAberta(false)}>
                {totalResultados === undefined
                  ? 'Concluir'
                  : totalResultados === 1 ? 'Ver 1 resultado' : `Ver ${totalResultados} resultados`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Campo de seletor em largura total, para dentro da folha. */
export function CampoSelect({
  rotulo, valor, onChange, children, disabled,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className={ROTULO_FILTRO}>{rotulo}</span>
      <select className="input mt-1 w-full" value={valor} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {children}
      </select>
    </label>
  );
}
