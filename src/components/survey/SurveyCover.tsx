import { BotaoCapa, FaixaTopo, Ticket, TituloCapa } from '@/components/theme/Comanda';

/**
 * Capa das telas de início da pesquisa — a "cara do Spot".
 *
 * Linguagem "Comanda" (ver src/components/theme/Comanda.tsx): faixa preta fina
 * no topo com a casa e a data, o título grande em Fraunces à esquerda e, à
 * direita, a comanda de papel com o aviso de anonimato e o botão. No celular
 * a comanda desce para baixo do título.
 *
 * Todas as cores saem dos tokens (spot-yellow/black/cream/...), então a capa
 * acompanha o modo escuro do aparelho sem código próprio.
 */
export function SurveyCover({
  eyebrow = 'Pesquisa interna',
  title,
  description,
  aside,
  action,
  footer,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** Texto da comanda — normalmente o aviso de anonimato. */
  aside?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-spot-cream flex flex-col">
      <FaixaTopo rotulo="Restaurante Spot · Spot Integra" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 sm:px-10 py-10 sm:py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16 items-end">
          <TituloCapa rotulo={eyebrow} titulo={title}>
            {description && (
              <div
                className="mt-8 max-w-xl text-base leading-relaxed text-spot-gray-700 animate-fadeIn"
                style={{ animationDelay: '220ms' }}
              >
                {description}
              </div>
            )}
          </TituloCapa>

          {(aside || action || footer) && (
            <Ticket cabecalho={<><span>Antes de começar</span><span aria-hidden>Nº 01</span></>}>
              {aside && <div className="text-sm leading-relaxed text-spot-gray-700">{aside}</div>}
              {action}
              {footer}
            </Ticket>
          )}
        </div>
      </div>
    </div>
  );
}

/** Botão grande da capa. Mantido com este nome para as telas da pesquisa. */
export function CoverButton({
  children, onClick, disabled = false,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <BotaoCapa onClick={onClick} disabled={disabled}>{children}</BotaoCapa>;
}
