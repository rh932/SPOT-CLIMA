'use client';

import { useRef } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Spinner } from './async';
import { ehIOS, usePush } from './usePush';
import { PushPassoAPasso } from './PushPassoAPasso';

/**
 * Trava a tela até o aviso no celular ser ligado neste aparelho.
 *
 * Quem avalia (gestor, gerente, líder) é quem precisa agir no prazo: sem o
 * aviso, a avaliação pendente só aparece se a pessoa lembrar de abrir o painel.
 * Por isso aqui não há "Agora não" — só ligar, ou sair da conta.
 *
 * Só trava quando dá para cumprir: aviso desligado, bloqueado no navegador ou
 * iPhone ainda fora da Tela de Início. Navegador sem suporte ou servidor sem
 * chaves (`indisponivel`, `desconfigurado`) deixam passar — travar quem não tem
 * como ligar seria trancar a pessoa fora do sistema.
 */
export function PushGate({ portal, onSair }: { portal: 'admin' | 'gestor'; onSair: () => void }) {
  const { estado, ocupado, erro, ligar } = usePush(portal);

  // Guarda o último estado mostrado: enquanto a tela se fecha, o conteúdo não
  // pode trocar para o texto de "ligado".
  const visivel = estado === 'desligado' || estado === 'instalar' || estado === 'bloqueado';
  const mostrado = useRef(estado);
  if (visivel) mostrado.current = estado;
  const e = mostrado.current;

  return (
    <AnimatePresence>
    {visivel && (
    <MotionConfig key="gate" reducedMotion="user">
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-gate-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-spot-black/70 p-4 print:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // Ao ligar, a tela recolhe num círculo no canto do cabeçalho, onde fica
      // o sino: é de lá que chegam os avisos agora.
      exit={{ clipPath: 'circle(0% at 92% 28px)', opacity: 0.5, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ duration: 0.2 }}
    >
      {/* Os passos do iPhone são longos: no celular pequeno a caixa rola, em vez de cortar o botão de sair. */}
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-spot-white rounded-xl2 border-l-[3px] border-l-spot-yellow p-6 shadow-xl">
        <h2 id="push-gate-titulo" className="text-lg font-bold">Ative os avisos para continuar</h2>
        <p className="text-sm text-spot-gray-600 leading-snug mt-2">
          Treinamento novo, avaliação pendente e mudanças na sua equipe chegam como aviso no aparelho.
          Para quem avalia, ele é obrigatório: é por ele que você fica sabendo a tempo.
        </p>

        {e === 'bloqueado' && (ehIOS() ? (
          <>
            <p className="text-sm text-spot-gray-700 leading-snug mt-3">Os avisos estão bloqueados neste iPhone.</p>
            <PushPassoAPasso tipo="desbloquear" />
          </>
        ) : (
          <p className="text-sm text-spot-gray-700 leading-snug mt-3">
            Os avisos estão bloqueados neste aparelho. Toque no cadeado ao lado do endereço (ou em
            Configurações do site), libere as Notificações e recarregue a página.
          </p>
        ))}
        {e === 'instalar' && <PushPassoAPasso tipo="instalar" />}

        <div className="flex flex-wrap items-center gap-2 mt-5">
          {e === 'desligado' && (
            <button
              type="button"
              onClick={ligar}
              disabled={ocupado}
              aria-busy={ocupado || undefined}
              className="rounded-btn px-5 min-h-11 text-sm font-semibold bg-spot-yellow text-spot-onYellow hover:bg-spot-yellowDark transition disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {ocupado && <Spinner className="h-3 w-3" />}
              {ocupado ? 'Ligando...' : 'Ligar avisos'}
            </button>
          )}
          {e === 'bloqueado' && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-btn px-5 min-h-11 text-sm font-semibold bg-spot-yellow text-spot-onYellow hover:bg-spot-yellowDark transition"
            >
              Já liberei, recarregar
            </button>
          )}
          <button
            type="button"
            onClick={onSair}
            className="rounded-btn px-3 min-h-11 text-xs text-spot-gray-600 hover:text-spot-black transition"
          >
            Sair da conta
          </button>
        </div>
        {erro && <p role="alert" className="text-xs text-spot-danger mt-3">{erro}</p>}
      </div>
    </motion.div>
    </MotionConfig>
    )}
    </AnimatePresence>
  );
}
