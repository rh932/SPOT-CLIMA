'use client';

import Link from 'next/link';
import { dueBadge } from '@/lib/probation';
import { PERTO_DE_VENCER_DIAS } from '@/lib/gestorEquipe';

export interface ItemPertoDeVencer {
  id: string;
  nome: string;
  detalhe: string;
  /** Vencimento em aberto (contrato de experiência ou próximo feedback). */
  prazo: Date;
  /** Com `href` a linha vira um link; com `onClick`, um botão. */
  href?: string;
  onClick?: () => void;
}

/**
 * Coluna "Perto de vencer": só quem vence em poucos dias (ou já passou do
 * prazo). A lista completa continua na tela, abaixo; esta coluna é o que pede
 * ação agora, e fica ao lado no computador e no topo no celular.
 */
export function ColunaPertoDeVencer({
  id, itens, vazio,
}: { id: string; itens: ItemPertoDeVencer[]; vazio: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2
        id={id}
        className="flex items-baseline justify-between gap-3 border-b-[3px] border-spot-yellow pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-spot-gray-800"
      >
        <span>Perto de vencer</span>
        <span className="tabular">{itens.length}</span>
      </h2>
      <p className="text-xs text-spot-gray-500">Vencem em até {PERTO_DE_VENCER_DIAS} dias ou já passaram do prazo.</p>

      {itens.length === 0 ? (
        <p className="text-sm text-spot-gray-500 py-2">{vazio}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-spot-gray-200 border-b border-spot-gray-200">
          {itens.map((i) => {
            const badge = dueBadge(i.prazo);
            const conteudo = (
              <>
                <span className="block font-semibold truncate">{i.nome}</span>
                <span className="block text-xs text-spot-gray-500 truncate">{i.detalhe}</span>
                {badge && <span className={`block text-xs mt-0.5 ${badge.className}`}>{badge.label}</span>}
              </>
            );
            const classe = 'block w-full py-3 text-left hover:bg-spot-white transition-colors';
            return (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} className={classe}>{conteudo}</Link>
                ) : i.onClick ? (
                  <button type="button" onClick={i.onClick} className={classe}>{conteudo}</button>
                ) : (
                  <div className="py-3">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
