import { SpotBrand } from '@/components/theme/SpotBrand';

/**
 * Peças da capa na linguagem "Comanda" (ver design-system/spot-clima/MASTER.md),
 * usadas pela capa da pesquisa (SurveyCover) e pela entrada dos painéis
 * (LoginCover) — a mesma porta para todo mundo que trabalha no Spot.
 *
 * Substituem as formas amarelas orgânicas nos cantos e o título em cartão
 * amarelo com sombra deslocada: as duas coisas eram enfeite que qualquer
 * gerador de landing page faz. A ideia agora vem do próprio restaurante — a
 * comanda que sai da impressora da cozinha: papel, filete grosso de tinta,
 * texto em mono e borda serrilhada onde ela é destacada.
 */

/** Data curta em mono, como no cabeçalho da comanda: "QUA 28/10". */
function dataDeHoje() {
  const d = new Date();
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia} ${data}`;
}

/**
 * Faixa preta do topo: a moldura que já era a cara da capa, agora fina e com
 * conteúdo — o nome da casa à esquerda e a data à direita, em mono.
 */
export function FaixaTopo({ rotulo }: { rotulo: string }) {
  return (
    <div className="bg-spot-sidebar text-spot-sidebarText shrink-0">
      <div className="mx-auto flex h-10 w-full max-w-6xl items-center justify-between gap-4 px-6 sm:px-10 font-mono text-[11px] uppercase tracking-[0.16em]">
        <span className="flex items-center gap-2.5 min-w-0">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 bg-spot-yellow" />
          {/* No celular só o nome da casa: com a data ao lado, o rótulo
              inteiro não cabia em 375px e virava reticências. */}
          <span className="truncate sm:hidden">Restaurante Spot</span>
          <span className="truncate hidden sm:inline">{rotulo}</span>
        </span>
        {/* A data sai do relógio do aparelho; no servidor ela pode cair em
            outro dia (fuso), e a diferença não é erro. */}
        <span suppressHydrationWarning className="shrink-0 text-spot-sidebarText/70">{dataDeHoje()}</span>
      </div>
    </div>
  );
}

/**
 * Coluna do título: marca, rótulo em mono e o título em Fraunces leve, grande
 * o bastante para ser a primeira coisa lida do outro lado do balcão.
 */
export function TituloCapa({
  rotulo, titulo, children,
}: { rotulo: string; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex animate-fadeIn mb-10 sm:mb-14">
        <SpotBrand size="md" className="text-spot-black" />
      </div>
      <p className="rotulo-mono flex items-center gap-3 animate-fadeIn" style={{ animationDelay: '80ms' }}>
        <span aria-hidden className="h-[2px] w-8 bg-spot-gray-900" />
        {rotulo}
      </p>
      <h1
        className="mt-5 font-display text-[2.75rem] sm:text-6xl lg:text-[5.25rem] font-light leading-[0.98] tracking-[-0.03em] text-spot-gray-900 break-words animate-slideInLeft"
        style={{ animationDelay: '140ms' }}
      >
        {titulo}
      </h1>
      {children}
    </div>
  );
}

/**
 * A comanda: folha de papel com filete grosso no topo, cabeçalho em mono,
 * divisões por picote e borda serrilhada embaixo. Entra "imprimindo", de
 * cima para baixo — a única entrada com personalidade da capa.
 */
export function Ticket({
  cabecalho, children, delay = 260,
}: { cabecalho: React.ReactNode; children: React.ReactNode; delay?: number }) {
  return (
    <div className="serrilha w-full animate-imprimir" style={{ animationDelay: `${delay}ms` }}>
      <div className="bg-spot-white border-x border-spot-gray-200 border-t-[6px] border-t-spot-gray-900">
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 rotulo-mono">
          {cabecalho}
        </div>
        <div className="picote" />
        <div className="px-5 sm:px-6 pt-5 pb-7 flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Botão grande da capa: bloco amarelo cheio, rótulo à esquerda e a seta em
 * mono à direita, que anda no hover. O amarelo é ação — é a única coisa
 * amarela grande da tela.
 */
export function BotaoCapa({
  children, onClick, disabled = false, refBotao,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  refBotao?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={refBotao}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full min-h-14 items-center justify-between gap-4 rounded-btn bg-spot-yellow px-5 text-left text-lg font-semibold text-spot-onYellow transition-colors hover:bg-spot-yellowDark active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <span>{children}</span>
      <span aria-hidden className="font-mono text-base transition-transform group-hover:translate-x-1">→</span>
    </button>
  );
}
