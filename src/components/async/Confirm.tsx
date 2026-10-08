'use client';

/**
 * Confirmação antes de uma ação que não volta atrás.
 *
 * Substitui o `confirm()` do navegador, que estava em 14 telas. Ele tinha três
 * defeitos que não se consertam por fora:
 *   - no celular abre uma caixa do sistema com o ENDEREÇO do site no título
 *     ("spot-clima.vercel.app diz:"), que parece aviso de golpe;
 *   - os dois botões são "OK" e "Cancelar" — "OK" não diz o que vai acontecer,
 *     e numa exclusão isso é justamente o que a pessoa precisa ler;
 *   - bloqueia a página inteira, inclusive o Toast que confirmaria o resultado.
 *
 * Uso — a chamada continua com a mesma forma de antes, só ganhou `await`:
 *
 *   const confirmar = useConfirm();
 *   if (!(await confirmar({ titulo: 'Excluir o setor "Salão"?', acao: 'Excluir', perigo: true }))) return;
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { usePainelModal } from '@/components/forms/usePainelModal';

export interface PedidoConfirmacao {
  /** A pergunta, com o nome do que será afetado. */
  titulo: string;
  /** O que acontece em consequência — um parágrafo, sem repetir o título. */
  texto?: string;
  /** Rótulo do botão que executa. Verbo, nunca "OK". */
  acao: string;
  /** Pinta a ação de vermelho e acrescenta "Isso não pode ser desfeito." */
  perigo?: boolean;
}

type Confirmar = (pedido: PedidoConfirmacao) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar | null>(null);

export function useConfirm(): Confirmar {
  const ctx = useContext(ConfirmContext);
  // Fora do provedor (bancada de auditoria, tela isolada), cai no nativo em
  // vez de quebrar: pior aparência, mesma proteção.
  return ctx ?? (async (p) => window.confirm(p.texto ? `${p.titulo}\n\n${p.texto}` : p.titulo));
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>((p) => {
    // Um pedido novo com outro aberto responde "não" ao anterior, para
    // nenhuma promessa ficar pendurada.
    resolverRef.current?.(false);
    setPedido(p);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const responder = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setPedido(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {pedido && <Dialogo pedido={pedido} onResponder={responder} />}
    </ConfirmContext.Provider>
  );
}

function Dialogo({ pedido, onResponder }: { pedido: PedidoConfirmacao; onResponder: (ok: boolean) => void }) {
  // O foco entra no primeiro botão focável — "Cancelar", de propósito: um
  // Enter apressado não pode ser o que apaga.
  const painelRef = usePainelModal<HTMLDivElement>({ aberto: true, aoFechar: () => onResponder(false) });

  return (
    <div className="modal-overlay" onClick={() => onResponder(false)}>
      <div
        ref={painelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-titulo"
        aria-describedby={pedido.texto || pedido.perigo ? 'confirmar-texto' : undefined}
        className="modal-panel bg-spot-white w-full max-w-md rounded-xl2 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirmar-titulo" className="font-display text-xl font-semibold leading-snug">
          {pedido.titulo}
        </h2>
        {(pedido.texto || pedido.perigo) && (
          <div id="confirmar-texto" className="text-sm text-spot-gray-700 leading-relaxed flex flex-col gap-2 max-w-prose">
            {pedido.texto && <p>{pedido.texto}</p>}
            {pedido.perigo && <p className="font-semibold text-spot-gray-900">Isso não pode ser desfeito.</p>}
          </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
          <button type="button" className="btn-ghost" onClick={() => onResponder(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className={pedido.perigo ? 'btn-danger' : 'btn-secondary'}
            onClick={() => onResponder(true)}
          >
            {pedido.acao}
          </button>
        </div>
      </div>
    </div>
  );
}
