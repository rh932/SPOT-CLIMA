/**
 * Auditor de nome acessível — NÃO faz parte do produto.
 *
 * Percorre todo controle interativo VISÍVEL da tela e calcula o nome que o
 * leitor de tela vai anunciar, aproximando o algoritmo accname:
 *   aria-label > aria-labelledby > texto (ignorando subárvores aria-hidden)
 *   > title > alt.
 *
 * Existe porque ler o JSX não responde a pergunta certa. Um ícone com rótulo
 * ao lado parece resolvido no código e ainda assim é anunciado como
 * "quadrado com metade esquerda preta, Pesquisas"; um botão "Remover" repetido
 * seis vezes parece claro na tela e é indistinguível numa lista de links.
 * Só a árvore renderizada diz o que a pessoa realmente ouve.
 *
 * A bancada expõe isto em `window.auditarControles()`.
 */

export interface AchadoControle {
  tag: string;
  nome: string;
  origem: string;
  problemas: string[];
  trecho: string;
}

/** Glifos e setas que não carregam texto legível por conta própria. */
const SO_SIMBOLO = /^[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}\u{00D7}\u{2715}-\u{2718}\s]*$/u;

/**
 * Rótulos que não dizem sobre O QUÊ agem. Sozinhos numa página seriam
 * aceitáveis; o problema é que se repetem por item de lista, e quem navega por
 * links/botões ouve a mesma palavra várias vezes sem âncora nenhuma.
 */
const GENERICOS = /^(fechar|ver|abrir|editar|remover|excluir|apagar|salvar|ok|sim|não|nao|\.\.\.|mais|detalhes)$/i;

/** Alvo mínimo de toque já adotado no projeto (min-h-11 = 44px). */
const ALVO_MINIMO = 44;

function textoVisivel(el: Element): string {
  let t = '';
  el.childNodes.forEach((no) => {
    if (no.nodeType === Node.TEXT_NODE) { t += no.textContent ?? ''; return; }
    if (no.nodeType !== Node.ELEMENT_NODE) return;
    const filho = no as Element;
    // aria-hidden some da árvore de acessibilidade — é assim que um ícone
    // decorativo deixa de poluir o nome do botão.
    if (filho.hasAttribute('aria-hidden')) return;
    const st = getComputedStyle(filho);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    t += textoVisivel(filho);
  });
  return t;
}

/**
 * O elemento que efetivamente recebe o clique/toque.
 *
 * Um radio ou checkbox dentro de um <label> é acionado por qualquer ponto do
 * rótulo — medir a caixinha (13x13px, ou 1x1 quando `sr-only`) daria um falso
 * positivo de alvo pequeno em controles cuja área real é a linha inteira.
 */
function alvoDeToque(el: Element): Element {
  if (el.matches('input[type="radio"], input[type="checkbox"]')) {
    return el.closest('label') ?? el;
  }
  return el;
}

/** O controle está dentro de um fieldset/radiogroup com rótulo próprio? */
function emGrupoRotulado(el: Element): boolean {
  const grupo = el.closest('fieldset, [role="radiogroup"], [role="group"]');
  if (!grupo) return false;
  if (grupo.tagName === 'FIELDSET') return Boolean(grupo.querySelector('legend')?.textContent?.trim());
  return Boolean(grupo.getAttribute('aria-label') || grupo.getAttribute('aria-labelledby'));
}

function nomeAcessivel(el: Element): { nome: string; origem: string } {
  const label = el.getAttribute('aria-label');
  if (label?.trim()) return { nome: label.trim(), origem: 'aria-label' };

  const ref = el.getAttribute('aria-labelledby');
  if (ref) {
    const partes = ref.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (partes.length) return { nome: partes.join(' '), origem: 'aria-labelledby' };
  }

  if (el.matches('input, select, textarea')) {
    const campo = el as HTMLInputElement;
    const lab = campo.labels?.[0];
    if (lab?.textContent?.trim()) return { nome: lab.textContent.trim(), origem: 'label' };
    const ph = el.getAttribute('placeholder');
    // placeholder some no instante em que a pessoa digita: serve de dica,
    // nunca de rótulo.
    if (ph?.trim()) return { nome: ph.trim(), origem: 'placeholder(fragil)' };
  }

  const txt = textoVisivel(el).replace(/\s+/g, ' ').trim();
  if (txt) return { nome: txt, origem: 'texto' };

  const title = el.getAttribute('title');
  // title não aparece no toque (não há hover no celular) e vários leitores de
  // tela o ignoram quando existe qualquer outro conteúdo.
  if (title?.trim()) return { nome: title.trim(), origem: 'title(fragil)' };

  const img = el.querySelector('img[alt]') as HTMLImageElement | null;
  if (img?.alt?.trim()) return { nome: img.alt.trim(), origem: 'alt' };

  return { nome: '', origem: 'NENHUMA' };
}

export function auditarControles() {
  const SELETOR = 'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, summary';

  const visiveis = Array.from(document.querySelectorAll(SELETOR)).filter((el) => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    // Checar só o próprio elemento não basta: a barra do celular e a sidebar
    // do desktop coexistem no DOM, escondidas por `lg:hidden`/`hidden lg:flex`
    // no ANCESTRAL. Sem isto o auditor acusava "Avisos x2" — dois sinos —
    // quando só um está na tela. Retângulo zerado pega a árvore inteira.
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    if (el.closest('[data-bancada]')) return false; // a barra da própria bancada não conta
    return true;
  });

  const achados: AchadoControle[] = [];

  for (const el of visiveis) {
    // Um radio/checkbox `sr-only` mede 1x1px, mas quem recebe o toque e o
    // <label> que o envolve. Medir o input daria um falso positivo de alvo
    // pequeno justamente nos controles que acabaram de ser corrigidos.
    const alvo = alvoDeToque(el);
    const r = alvo.getBoundingClientRect();
    const { nome, origem } = nomeAcessivel(el);
    const problemas: string[] = [];

    if (!nome) problemas.push('SEM NOME ACESSIVEL');
    else if (SO_SIMBOLO.test(nome)) problemas.push(`NOME E SO SIMBOLO (${JSON.stringify(nome)})`);
    else if (nome.length <= 2) problemas.push('NOME DE 1-2 CARACTERES');
    // "Sim" dentro de um fieldset "Você recebeu treinamento?" não é genérico:
    // o grupo já deu o contexto.
    else if (GENERICOS.test(nome) && !emGrupoRotulado(el)) problemas.push('NOME GENERICO (nao diz sobre o que age)');

    if (origem.includes('fragil')) problemas.push(`NOME VEM DE ${origem}`);

    if (r.width > 0 && r.height > 0 && (r.height < ALVO_MINIMO || r.width < ALVO_MINIMO)) {
      problemas.push(`ALVO DE TOQUE ${Math.round(r.width)}x${Math.round(r.height)}px (minimo ${ALVO_MINIMO})`);
    }

    if (problemas.length) {
      achados.push({
        tag: el.tagName.toLowerCase(),
        nome: nome || '(vazio)',
        origem,
        problemas,
        trecho: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      });
    }
  }

  /**
   * Nomes repetidos: o mesmo rótulo em controles que fazem coisas diferentes.
   *
   * Radios dentro de um grupo rotulado ficam de fora: "Sim"/"Não" repetidos são
   * o comportamento CERTO ali — o leitor de tela anuncia a legenda do grupo
   * antes da opção, então cada "Sim" já vem com a pergunta dele.
   */
  const porNome = new Map<string, number>();
  for (const el of visiveis) {
    if (emGrupoRotulado(el)) continue;
    const { nome } = nomeAcessivel(el);
    if (nome) porNome.set(nome, (porNome.get(nome) ?? 0) + 1);
  }
  const repetidos = [...porNome.entries()]
    .filter(([, n]) => n > 1)
    .map(([nome, n]) => `${JSON.stringify(nome)} x${n}`);

  return {
    totalVisiveis: visiveis.length,
    comProblema: achados.length,
    nomesRepetidos: repetidos,
    achados,
  };
}
