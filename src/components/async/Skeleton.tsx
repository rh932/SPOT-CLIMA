'use client';

/**
 * Esqueletos de carregamento.
 *
 * Por que esqueleto e não "Carregando...": o painel é usado no celular, dentro
 * do restaurante, em rede ruim. Uma linha de texto cinza numa tela em branco
 * não diz se a página está vindo ou se travou — as pessoas recarregam ou saem.
 * O esqueleto mostra a FORMA do que vem e a tela deixa de parecer quebrada.
 *
 * O `animate-pulse` é muted pela regra global de prefers-reduced-motion
 * (globals.css zera duração e iterações), então quem pediu menos movimento vê
 * blocos estáticos — que continuam cumprindo o papel.
 *
 * Tudo aqui é `aria-hidden`: para quem usa leitor de tela, o aviso certo é o
 * texto do <LiveStatus>, não uma pilha de caixas vazias.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  // spot-gray-300 e não 200: o 200 é a cor da BORDA dos cards (#E4E4E1) e os
  // blocos sumiam dentro do card branco — o esqueleto virava um card vazio,
  // que é exatamente a impressão de tela quebrada que ele deveria evitar.
  return <div aria-hidden className={`animate-pulse rounded-md bg-spot-gray-300 ${className}`} />;
}

/** Bloco de linhas de texto, com a última mais curta — como texto de verdade. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
      ))}
    </div>
  );
}

/**
 * Lista de cards — o formato de quase toda tela do gestor e do admin
 * (colaborador, pesquisa, treinamento). `rows` é só uma dica visual: a lista
 * real pode vir maior ou menor.
 */
export function SkeletonCardList({ rows = 4, comBadge = true }: { rows?: number; comBadge?: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <Skeleton className="h-4 w-2/5 max-w-[14rem]" />
            <Skeleton className="h-3 w-3/5 max-w-[20rem]" />
            <Skeleton className="h-3 w-1/4 max-w-[9rem]" />
          </div>
          {comBadge && <Skeleton className="h-6 w-20 shrink-0 rounded-btn" />}
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de formulário — usado nas telas de avaliação e treinamento. */
export function SkeletonForm({ campos = 4 }: { campos?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-1/2 max-w-[16rem]" />
        <Skeleton className="h-3 w-2/3 max-w-[22rem]" />
      </div>
      {Array.from({ length: campos }).map((_, i) => (
        <div key={i} className="card flex flex-col gap-3">
          <Skeleton className="h-4 w-1/3 max-w-[12rem]" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de cartões de número (dashboards). */
export function SkeletonStats({ cards = 4 }: { cards?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="card flex flex-col gap-3">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de tabela — relatórios e listas largas. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden className="card flex flex-col gap-3 overflow-hidden">
      <div className="flex gap-3">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 flex-1" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}
