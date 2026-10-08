import { SpotBrand } from '@/components/theme/SpotBrand';

/**
 * Capa das telas de início da pesquisa — a "cara do Spot".
 *
 * Linguagem visual: moldura preta em cima e embaixo, formas amarelas orgânicas
 * nos cantos, título num cartão amarelo com sombra sólida (sem blur) e blocos
 * de texto marcados por colchetes amarelos.
 *
 * Todas as cores saem dos tokens (spot-yellow/black/cream/...), então a capa
 * acompanha o modo escuro do aparelho sem código próprio.
 */

function CornerBlobs() {
  return (
    <>
      {/* Canto superior direito */}
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
      {/* Canto inferior esquerdo */}
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

/** Bloco de texto com colchetes amarelos nos cantos, como no modelo. */
export function BracketBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative px-5 py-4 sm:px-6 sm:py-5">
      <span aria-hidden className="absolute left-0 top-0 h-8 w-8 border-l-[3px] border-t-[3px] border-spot-yellow" />
      <span aria-hidden className="absolute bottom-0 right-0 h-8 w-8 border-b-[3px] border-r-[3px] border-spot-yellow" />
      <div className="text-sm leading-relaxed text-spot-gray-700">{children}</div>
    </div>
  );
}

export function SurveyCover({
  eyebrow = 'Pesquisa Interna',
  title,
  description,
  aside,
  action,
  footer,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** Coluna da direita — normalmente o aviso de anonimato. */
  aside?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-spot-white flex flex-col">
      {/* Moldura preta superior */}
      <div className="h-5 sm:h-7 bg-spot-black shrink-0" />

      <div className="relative flex-1 overflow-hidden">
        <CornerBlobs />

        <div className="relative mx-auto w-full max-w-6xl px-6 sm:px-10 py-10 sm:py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14 items-center">
            {/* Coluna esquerda: rótulo, título e descrição.
                As entradas são escalonadas para o olho percorrer na ordem certa. */}
            <div>
              <div className="flex items-center gap-4 mb-6 animate-slideInLeft">
                <p className="text-sm font-bold text-spot-black whitespace-nowrap">{eyebrow}</p>
                <span aria-hidden className="h-[2px] flex-1 bg-spot-black origin-left" />
              </div>

              {/* Cartão do título com sombra sólida deslocada */}
              <div className="relative inline-block max-w-full animate-stampIn" style={{ animationDelay: '120ms' }}>
                <span aria-hidden className="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl bg-spot-black" />
                <h1 className="relative rounded-2xl bg-spot-yellow px-6 py-6 sm:px-9 sm:py-8 text-3xl sm:text-4xl lg:text-5xl font-extrabold uppercase leading-[1.05] tracking-tight text-spot-onYellow break-words">
                  {title}
                </h1>
              </div>

              {description && (
                <div className="animate-slideInLeft" style={{ animationDelay: '260ms' }}>
                  <span aria-hidden className="mt-8 mb-5 block h-[2px] w-full bg-spot-black" />
                  {/* Justificado só a partir do tablet: em coluna estreita de
                      celular o texto justificado abre "rios" de espaço entre as
                      palavras e fica difícil de ler. */}
                  <div className="text-sm leading-relaxed text-spot-gray-700 sm:text-justify">{description}</div>
                </div>
              )}
            </div>

            {/* Coluna direita: marca, aviso e ação */}
            <div className="flex flex-col gap-8">
              {/* Alinhado à esquerda da coluna de propósito: encostado à
                  direita ele cai em cima da forma amarela do canto e some. */}
              <div className="flex animate-fadeIn" style={{ animationDelay: '180ms' }}>
                <SpotBrand size="md" className="text-spot-black" />
              </div>

              {aside && (
                <div className="animate-slideInRight" style={{ animationDelay: '320ms' }}>
                  <BracketBox>{aside}</BracketBox>
                </div>
              )}

              {action && (
                <div className="animate-slideInRight" style={{ animationDelay: '420ms' }}>
                  {action}
                </div>
              )}
              {footer}
            </div>
          </div>
        </div>
      </div>

      {/* Moldura preta inferior */}
      <div className="h-8 sm:h-10 bg-spot-black shrink-0" />
    </div>
  );
}

/** Botão grande da capa, com a "abinha" amarela à esquerda, como no modelo. */
export function CoverButton({
  children, onClick, disabled = false,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative flex w-full items-center overflow-hidden rounded-xl p-1 text-left transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {/* Faixa clara: camada própria com opacity, porque o Tailwind não aplica
          modificador de opacidade (`/25`) sobre cor vinda de variável CSS. */}
      <span aria-hidden className="absolute inset-0 bg-spot-yellow opacity-25 transition group-hover:opacity-40" />
      <span
        aria-hidden
        className="relative h-11 w-8 shrink-0 rounded-lg bg-spot-yellow animate-breathe group-hover:animate-none motion-reduce:animate-none"
      />
      <span className="relative flex-1 px-4 py-3 text-lg sm:text-xl font-bold text-spot-black text-center transition group-hover:translate-x-0.5">
        {children}
      </span>
    </button>
  );
}
