/**
 * Leva a pessoa até o primeiro campo que falta preencher.
 *
 * O defeito: nos formulários longos (avaliação com 8 dimensões, treinamento,
 * pesquisa), clicar em "Enviar" com um campo em branco só acendia um aviso
 * vermelho lá em cima. Quem clicou estava no rodapé, no celular, e não via
 * NADA acontecer — a tela parecia travada, e o clique era repetido.
 *
 * Marque o container de cada campo com `data-erro="true"` quando ele estiver
 * inválido e chame isto depois de acender os erros.
 *
 * Respeita prefers-reduced-motion: com a preferência ligada o salto é
 * instantâneo, sem a rolagem suave (que é justamente o que incomoda).
 */
export function scrollToFirstError(container?: HTMLElement | null) {
  if (typeof window === 'undefined') return;
  // Depois da pintura: os avisos de erro acabaram de ser renderizados neste
  // mesmo ciclo e o elemento ainda não existe no DOM quando a função é chamada.
  requestAnimationFrame(() => {
    const raiz = container ?? document;
    const alvo = raiz.querySelector<HTMLElement>('[data-erro="true"]');
    if (!alvo) return;

    const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    alvo.scrollIntoView({ behavior: semMovimento ? 'auto' : 'smooth', block: 'center' });

    // Foco no primeiro controle do bloco, para quem usa teclado e leitor de
    // tela chegar junto — não só a rolagem visual.
    const focavel = alvo.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])',
    );
    focavel?.focus({ preventScroll: true });
  });
}
