'use client';

import { Spinner } from './async';
import { usePush } from './usePush';

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

  if (estado !== 'desligado' && estado !== 'instalar' && estado !== 'bloqueado') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-gate-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-spot-black/70 p-4 print:hidden"
    >
      <div className="w-full max-w-md bg-spot-white rounded-xl2 border-l-[3px] border-l-spot-yellow p-6 shadow-xl">
        <h2 id="push-gate-titulo" className="text-lg font-bold">Ative os avisos para continuar</h2>
        <p className="text-sm text-spot-gray-600 leading-snug mt-2">
          Treinamento novo, avaliação pendente e mudanças na sua equipe chegam como aviso no aparelho.
          Para quem avalia, ele é obrigatório: é por ele que você fica sabendo a tempo.
        </p>

        {estado === 'bloqueado' && (
          <p className="text-sm text-spot-gray-700 leading-snug mt-3">
            Os avisos estão bloqueados neste aparelho. Toque no cadeado ao lado do endereço (ou em
            Configurações do site), libere as Notificações e recarregue a página.
          </p>
        )}
        {estado === 'instalar' && (
          <p className="text-sm text-spot-gray-700 leading-snug mt-3">
            No iPhone, toque em Compartilhar e escolha &quot;Adicionar à Tela de Início&quot;. Depois abra o
            Spot Integra por esse ícone e ligue os avisos.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-5">
          {estado === 'desligado' && (
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
          {estado === 'bloqueado' && (
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
    </div>
  );
}
