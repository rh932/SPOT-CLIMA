'use client';

/**
 * Confirmação de sucesso.
 *
 * O sistema salvava avaliações e treinamentos e voltava para a lista SEM dizer
 * nada. Com a lista ainda mostrando o valor antigo por um instante (recarga em
 * segundo plano), o treinador ficava sem saber se a ficha entrou — e registrava
 * de novo. Esta faixa é a resposta: apareceu, gravou.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface Aviso { id: number; texto: string; tipo: 'sucesso' | 'erro' }

const ToastContext = createContext<{ mostrar: (texto: string, tipo?: Aviso['tipo']) => void }>({
  mostrar: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const mostrar = useCallback((texto: string, tipo: Aviso['tipo'] = 'sucesso') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
  }, []);

  const fechar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  return (
    <ToastContext.Provider value={{ mostrar }}>
      {children}
      {/* `bottom` no celular: é onde o polegar está e onde ficam os botões de
          ação, então a confirmação nasce perto de onde a pessoa clicou. */}
      <div className="fixed inset-x-0 bottom-0 sm:bottom-4 z-[60] flex flex-col items-center gap-2 p-4 pointer-events-none print:hidden">
        {avisos.map((a) => <ToastItem key={a.id} aviso={a} onFechar={() => fechar(a.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

const DURACAO_MS = 4000;

function ToastItem({ aviso, onFechar }: { aviso: Aviso; onFechar: () => void }) {
  useEffect(() => {
    const t = setTimeout(onFechar, DURACAO_MS);
    return () => clearTimeout(t);
  }, [onFechar]);

  const sucesso = aviso.tipo === 'sucesso';
  return (
    <div
      role="status"
      aria-live="polite"
      /* Faixa escura nos dois casos (e nos dois modos: usa a cor da barra de
         navegação, que não inverte); o que muda é o filete e o ícone. Um bloco
         inteiro em vermelho saturado gritava mais que o próprio erro. O aviso
         paira de verdade sobre a página, então é dos poucos com sombra. */
      className={`pointer-events-auto w-full max-w-sm rounded-xl2 bg-spot-sidebar text-spot-sidebarText ring-1 ring-white/10 border-l-[3px] pl-3.5 pr-2 py-2 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] flex items-center gap-3 animate-fadeInUp ${
        sucesso ? 'border-spot-yellow' : 'border-spot-danger'
      }`}
    >
      <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 ${sucesso ? 'text-spot-yellow' : 'text-spot-danger'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {sucesso ? <path d="M4 10.5l4 4 8-9" /> : <><path d="M10 5.5v5.5" /><path d="M10 14.5v.01" /></>}
      </svg>
      <p className="text-sm flex-1 leading-snug py-1.5">{aviso.texto}</p>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar aviso"
        className="h-11 w-11 -my-1 shrink-0 inline-flex items-center justify-center text-spot-sidebarText/60 hover:text-spot-sidebarText transition-colors"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}
