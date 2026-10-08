'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpotBrand } from '@/components/theme/SpotBrand';
import { usePainelModal } from '@/components/forms/usePainelModal';

/**
 * Porta de entrada dos painéis internos (/admin e /gestor).
 *
 * A linguagem visual é a MESMA da pesquisa do funcionário (SurveyCover):
 * moldura preta em cima e embaixo, formas amarelas orgânicas nos cantos e o
 * título num cartão amarelo com sombra sólida. Quem trabalha no Spot vê a
 * mesma cara em qualquer porta do sistema.
 *
 * O login em si não fica exposto na capa: a tela abre com a marca e um único
 * botão "Entrar"; ao clicar, o painel de e-mail e senha SOBE pela base da tela
 * enquanto a capa recua ao fundo. Fechar o painel devolve a capa.
 *
 * Tudo sai dos tokens (spot-yellow/black/cream/...), então a capa acompanha
 * o modo escuro do aparelho sem código próprio.
 */

function CornerBlobs() {
  return (
    <>
      <svg
        aria-hidden
        viewBox="0 0 200 160"
        className="pointer-events-none absolute -top-2 right-0 w-40 sm:w-56 lg:w-72 text-spot-yellow animate-drift motion-reduce:animate-none"
        preserveAspectRatio="none"
      >
        <path
          fill="currentColor"
          d="M200 0v160c-28-6-36-34-58-46-26-14-58-6-76-26C48 68 60 36 78 18 92 4 112 0 132 0h68z"
        />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 200 160"
        className="pointer-events-none absolute bottom-0 left-0 w-36 sm:w-52 lg:w-64 text-spot-yellow animate-driftSlow motion-reduce:animate-none"
        preserveAspectRatio="none"
      >
        <path
          fill="currentColor"
          d="M0 160V26c26 4 38 30 62 42 28 14 62 4 82 24 16 16 8 44-8 62-12 14-30 6-52 6H0z"
        />
      </svg>
    </>
  );
}

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
    <div className="min-h-dvh bg-spot-white flex flex-col">
      <div className="h-5 sm:h-7 bg-spot-black shrink-0" />

      {/* `overflow-x-hidden` (e não `overflow-hidden`) de propósito: segura as
          formas decorativas dentro da tela sem cortar o conteúdo na vertical —
          num celular deitado, a capa precisa poder rolar. */}
      <div
        className={`relative flex flex-1 overflow-x-hidden ${showSheet && !closing ? 'animate-coverRecede' : ''}`}
        aria-hidden={showSheet}
      >
        <CornerBlobs />

        <div className="relative mx-auto flex w-full max-w-4xl flex-col justify-center px-6 sm:px-10 py-12 sm:py-16">
          <div className="flex animate-fadeIn mb-8">
            <SpotBrand size="lg" className="text-spot-black" />
          </div>

          <div className="flex items-center gap-4 mb-6 animate-slideInLeft">
            <p className="text-sm font-bold text-spot-black whitespace-nowrap">{eyebrow}</p>
            <span aria-hidden className="h-[2px] flex-1 bg-spot-black origin-left" />
          </div>

          <div className="relative inline-block max-w-full self-start animate-stampIn" style={{ animationDelay: '120ms' }}>
            <span aria-hidden className="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl bg-spot-black" />
            <h1 className="relative rounded-2xl bg-spot-yellow px-6 py-6 sm:px-9 sm:py-8 text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase leading-[1.05] tracking-tight text-spot-onYellow break-words">
              {title}
            </h1>
          </div>

          <div className="animate-slideInLeft max-w-xl" style={{ animationDelay: '260ms' }}>
            <span aria-hidden className="mt-8 mb-5 block h-[2px] w-full bg-spot-black" />
            <div className="text-sm leading-relaxed text-spot-gray-700">{description}</div>
          </div>

          <div className="mt-9 max-w-sm animate-slideInRight" style={{ animationDelay: '380ms' }}>
            <button
              ref={openButtonRef}
              type="button"
              onClick={() => setOpen(true)}
              className="group relative flex w-full items-center overflow-hidden rounded-xl p-1 text-left transition"
            >
              {/* Faixa clara em camada própria: o Tailwind não aplica modificador
                  de opacidade (`/25`) sobre cor vinda de variável CSS. */}
              <span aria-hidden className="absolute inset-0 bg-spot-yellow opacity-25 transition group-hover:opacity-40" />
              <span
                aria-hidden
                className="relative h-11 w-8 shrink-0 rounded-lg bg-spot-yellow animate-breathe group-hover:animate-none motion-reduce:animate-none"
              />
              <span className="relative flex-1 px-4 py-3 text-lg sm:text-xl font-bold text-spot-black text-center transition group-hover:translate-x-0.5">
                Entrar
              </span>
            </button>
            {acaoSecundaria && (
              <button
                type="button"
                onClick={() => { acaoSecundaria.onClick(); setOpen(true); }}
                className="mt-3 w-full min-h-11 text-sm font-semibold text-spot-black underline underline-offset-4 decoration-spot-yellow decoration-2 hover:decoration-spot-black transition"
              >
                {acaoSecundaria.rotulo}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="h-8 sm:h-10 bg-spot-black shrink-0" />

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
            <div className="w-full sm:max-w-md bg-spot-white rounded-t-[1.75rem] sm:rounded-t-[2rem] shadow-[0_-8px_40px_rgba(0,0,0,0.25)] max-h-[92vh] overflow-y-auto">
              {/* Faixa preta de topo + "puxador", o mesmo vocabulário da moldura. */}
              <div className="sticky top-0 bg-spot-white rounded-t-[1.75rem] sm:rounded-t-[2rem] pt-3 px-6 sm:px-8">
                <span aria-hidden className="mx-auto block h-1.5 w-12 rounded-full bg-spot-gray-300" />
                <div className="flex items-start justify-between gap-4 pt-5">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-extrabold uppercase tracking-tight text-spot-black">{sheetTitle}</h2>
                    <p className="text-sm text-spot-gray-500 mt-0.5">{sheetSubtitle}</p>
                  </div>
                  {/* "Fechar" sozinho nao diz o que fecha — e num app com
                     varios paineis a mesma palavra aparece em todos. h-11 w-11:
                     eram 36px, abaixo do alvo minimo adotado no projeto. */}
                  <button
                    type="button"
                    onClick={close}
                    aria-label={`Fechar ${sheetTitle.toLowerCase()} e voltar para a apresentação`}
                    className="shrink-0 rounded-full border border-spot-gray-300 h-11 w-11 flex items-center justify-center text-spot-gray-500 transition hover:bg-spot-gray-100 hover:text-spot-gray-900"
                  >
                    <span aria-hidden>✕</span>
                  </button>
                </div>
                <span aria-hidden className="mt-4 block h-[2px] w-full bg-spot-black" />
              </div>

              <div className="px-6 sm:px-8 pt-6 pb-8">{children}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
