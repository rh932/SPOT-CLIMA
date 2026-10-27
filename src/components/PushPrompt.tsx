'use client';

import { useEffect, useState } from 'react';
import { Spinner } from './async';
import { usePush } from './usePush';

/** Por quanto tempo o "Agora não" esconde o convite neste aparelho. */
const ADIAR_DIAS = 7;
const CHAVE = 'spot-push-convite-adiado';

function adiadoAte(): number {
  try {
    return Number(localStorage.getItem(CHAVE)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Convite para ligar o aviso no celular, no topo do conteúdo.
 *
 * O interruptor do sino continua existindo, mas escondido num popover ninguém
 * o encontra — e o celular é o canal que importa: o gestor passa o turno no
 * salão, não na frente do painel. Por isso o convite aparece só em aparelho
 * de toque, e só enquanto o aviso estiver desligado (ou, no iPhone, enquanto o
 * app não estiver na Tela de Início, que é o que o Safari exige).
 *
 * "Agora não" guarda o adiamento neste navegador por uma semana; se o
 * armazenamento estiver bloqueado, o convite só volta a aparecer — nada quebra.
 */
export function PushPrompt({ portal }: { portal: 'admin' | 'gestor' }) {
  const { estado, ocupado, erro, ligar } = usePush(portal);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const toque = window.matchMedia('(pointer: coarse)').matches;
    setVisivel(toque && adiadoAte() < Date.now());
  }, []);

  // `bloqueado` também aparece: quem negou a permissão sem querer é
  // justamente quem nunca mais vai receber aviso — e o caminho para liberar
  // fica escondido nas configurações do navegador.
  if (!visivel || (estado !== 'desligado' && estado !== 'instalar' && estado !== 'bloqueado')) return null;

  const adiar = () => {
    try {
      localStorage.setItem(CHAVE, String(Date.now() + ADIAR_DIAS * 24 * 60 * 60 * 1000));
    } catch {
      // Sem armazenamento, o convite apenas volta na próxima visita.
    }
    setVisivel(false);
  };

  return (
    <section
      aria-label="Avisos no celular"
      className="mb-5 bg-spot-white border border-spot-gray-200 border-l-[3px] border-l-spot-yellow rounded-xl2 px-4 py-3 print:hidden"
    >
      <p className="text-sm font-bold">Receba os avisos no celular</p>
      {estado === 'bloqueado' ? (
        <p className="text-xs text-spot-gray-600 leading-snug mt-1">
          Os avisos estão bloqueados neste aparelho. Toque no cadeado ao lado do endereço (ou em
          Configurações do site), libere as Notificações e recarregue a página.
        </p>
      ) : estado === 'instalar' ? (
        <p className="text-xs text-spot-gray-600 leading-snug mt-1">
          No iPhone, toque em Compartilhar e escolha &quot;Adicionar à Tela de Início&quot;. Depois abra o
          Spot Integra por esse ícone e ligue os avisos no sino.
        </p>
      ) : (
        <p className="text-xs text-spot-gray-600 leading-snug mt-1">
          Treinamento novo, avaliação pendente ou registrada e cada mudança na sua equipe chegam na hora,
          mesmo com o sistema fechado.
        </p>
      )}
      <div className="flex items-center gap-2 mt-3">
        {estado === 'desligado' && (
          <button
            type="button"
            onClick={ligar}
            disabled={ocupado}
            aria-busy={ocupado || undefined}
            className="rounded-btn px-4 min-h-11 text-xs font-semibold bg-spot-yellow text-spot-onYellow hover:bg-spot-yellowDark transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {ocupado && <Spinner className="h-3 w-3" />}
            {ocupado ? 'Ligando...' : 'Ligar avisos neste celular'}
          </button>
        )}
        <button
          type="button"
          onClick={adiar}
          className="rounded-btn px-3 min-h-11 text-xs text-spot-gray-600 hover:text-spot-black transition"
        >
          Agora não
        </button>
      </div>
      {erro && <p role="alert" className="text-xs text-spot-danger mt-2">{erro}</p>}
    </section>
  );
}
