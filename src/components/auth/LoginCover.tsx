'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BotaoCapa, FaixaTopo, Ticket, TituloCapa } from '@/components/theme/Comanda';
import { usePainelModal } from '@/components/forms/usePainelModal';

/**
 * Porta de entrada dos painéis internos (/admin e /gestor).
 *
 * A linguagem visual é a MESMA da pesquisa do funcionário (SurveyCover), a
 * "Comanda": faixa preta fina no topo, título grande em Fraunces à esquerda e
 * a comanda de papel à direita, com a descrição e o botão "Entrar". Quem
 * trabalha no Spot vê a mesma cara em qualquer porta do sistema.
 *
 * O login em si não fica exposto na capa: ao tocar em "Entrar", o painel de
 * e-mail e senha SOBE pela base da tela enquanto a capa recua ao fundo.
 * Fechar o painel devolve a capa.
 *
 * Tudo sai dos tokens (spot-yellow/black/cream/...), então a capa acompanha
 * o modo escuro do aparelho sem código próprio.
 */
export function LoginCover({
  eyebrow,
  title,
  description,
  sheetTitle,
  sheetSubtitle,
  children,
  abrir = false,
  acaoSecundaria,
}: {
  /** Rótulo curto do portal, ex.: "Painel administrativo". */
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  sheetTitle: string;
  sheetSubtitle: string;
  /** O formulário de login, renderizado dentro do painel que sobe. */
  children: React.ReactNode;
  /** Abre o painel sem o toque em "Entrar" (ex.: veio pelo link de primeiro acesso). */
  abrir?: boolean;
  /** Segundo caminho na capa, abaixo de "Entrar" — abre o mesmo painel. */
  acaoSecundaria?: { rotulo: string; onClick: () => void };
}) {
  // `closing` existe só para deixar a animação de descida terminar antes de
  // desmontar o painel — sem ele o painel sumiria de uma vez ao fechar.
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setClosing(true);
    // O timeout deixa a animacao de descida terminar antes de desmontar.
    window.setTimeout(() => { setClosing(false); setOpen(false); }, 280);
  }, []);

  /*
   * O painel ja fechava no Esc, ja movia o foco para o primeiro campo e ja
   * devolvia o foco ao botao "Entrar". O que faltava era PRENDER o foco: com o
   * painel de login aberto, o Tab saia dele e passeava pela capa atras —
   * inclusive pelo proprio botao "Entrar", que reabriria o painel. O hook faz
   * as quatro coisas de uma vez e some com a duplicacao.
   */
  const sheetRef = usePainelModal<HTMLDivElement>({ aberto: open, aoFechar: close });

  useEffect(() => { if (abrir) setOpen(true); }, [abrir]);

  const showSheet = open || closing;

  return (
    <div className="min-h-dvh bg-spot-cream flex flex-col">
      <FaixaTopo rotulo="Restaurante Spot · Spot Integra" />

      {/* `overflow-x-hidden` (e não `overflow-hidden`) de propósito: num
          celular deitado, a capa precisa poder rolar. */}
      <div
        className={`relative flex flex-1 overflow-x-hidden ${showSheet && !closing ? 'animate-coverRecede' : ''}`}
        aria-hidden={showSheet}
      >
        <div className="relative mx-auto w-full max-w-6xl self-center px-6 sm:px-10 py-10 sm:py-14 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16 items-end">
            <TituloCapa rotulo={eyebrow} titulo={title} />

            <Ticket cabecalho={<><span>Acesso restrito</span><span aria-hidden>RH · Gestão</span></>}>
              <div className="text-sm leading-relaxed text-spot-gray-700">{description}</div>
              <div>
                <BotaoCapa refBotao={openButtonRef} onClick={() => setOpen(true)}>Entrar</BotaoCapa>
                {acaoSecundaria && (
                  <button
                    type="button"
                    onClick={() => { acaoSecundaria.onClick(); setOpen(true); }}
                    className="mt-3 w-full min-h-11 text-sm font-semibold text-spot-gray-900 underline underline-offset-4 decoration-spot-yellow decoration-2 hover:decoration-spot-gray-900 transition"
                  >
                    {acaoSecundaria.rotulo}
                  </button>
                )}
              </div>
            </Ticket>
          </div>
        </div>
      </div>

      {showSheet && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/45 ${closing ? 'opacity-0 transition-opacity duration-300' : 'animate-fadeIn'}`}
            onClick={close}
            aria-hidden
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={sheetTitle}
            className={`fixed inset-x-0 bottom-0 z-50 flex justify-center px-0 sm:px-4 ${closing ? 'animate-sheetDown' : 'animate-sheetUp'}`}
          >
            <div className="w-full sm:max-w-md bg-spot-white rounded-t-xl2 border-t-[6px] border-spot-gray-900 shadow-[0_-8px_40px_rgba(0,0,0,0.25)] max-h-[92vh] overflow-y-auto">
              {/* Faixa preta de topo + "puxador", o mesmo vocabulário da moldura. */}
              <div className="sticky top-0 bg-spot-white pt-3 px-6 sm:px-8">
                <span aria-hidden className="mx-auto block h-1 w-12 bg-spot-gray-300" />
                <div className="flex items-start justify-between gap-4 pt-5">
                  <div className="min-w-0">
                    <h2 className="font-display text-3xl font-light tracking-tight text-spot-gray-900">{sheetTitle}</h2>
                    <p className="rotulo-mono mt-1.5">{sheetSubtitle}</p>
                  </div>
                  {/* "Fechar" sozinho nao diz o que fecha — e num app com
                     varios paineis a mesma palavra aparece em todos. h-11 w-11:
                     eram 36px, abaixo do alvo minimo adotado no projeto. */}
                  <button
                    type="button"
                    onClick={close}
                    aria-label={`Fechar ${sheetTitle.toLowerCase()} e voltar para a apresentação`}
                    className="shrink-0 rounded-btn border border-spot-gray-300 h-11 w-11 flex items-center justify-center text-spot-gray-500 transition hover:bg-spot-gray-100 hover:text-spot-gray-900"
                  >
                    <span aria-hidden>✕</span>
                  </button>
                </div>
                <span aria-hidden className="mt-4 block picote" />
              </div>

              <div className="px-6 sm:px-8 pt-6 pb-8">{children}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
