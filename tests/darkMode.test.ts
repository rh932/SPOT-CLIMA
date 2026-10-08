import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '../src/lib/contrast';

/*
 * Trava o contraste das duas paletas do globals.css.
 *
 * O modo escuro antigo quebrou justamente porque ninguém media o par
 * texto/fundo depois de trocar uma cor: o "preto" virou claro e o texto
 * branco em cima dele ficou invisível. Aqui cada par que o sistema usa de
 * verdade é conferido nos dois modos, a partir do próprio CSS.
 */

const css = readFileSync(join(__dirname, '../src/app/globals.css'), 'utf8');

function lerBloco(inicio: string): Record<string, string> {
  const i = css.indexOf(inicio);
  if (i < 0) throw new Error(`bloco não encontrado: ${inicio}`);
  const corpo = css.slice(i, css.indexOf('}', i));
  const vars: Record<string, string> = {};
  for (const m of corpo.matchAll(/--(spot-[\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    vars[m[1]] = '#' + [m[2], m[3], m[4]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  }
  return vars;
}

const claro = lerBloco(':root,\n[data-tema="claro"] {');
// O escuro só redeclara o que muda; o resto herda do claro.
const escuro = { ...claro, ...lerBloco('@media screen and (prefers-color-scheme: dark) {\n  :root {') };

/** [texto, fundo, mínimo] — 4.5 para texto corrido. */
const PARES: [string, string, number][] = [
  ['spot-gray-900', 'spot-cream', 4.5],
  ['spot-gray-900', 'spot-white', 4.5],
  ['spot-gray-600', 'spot-cream', 4.5],
  ['spot-gray-600', 'spot-white', 4.5],
  ['spot-gray-500', 'spot-cream', 4.5],
  ['spot-gray-500', 'spot-white', 4.5],
  ['spot-gray-600', 'spot-gray-100', 4.5],
  ['spot-danger', 'spot-white', 4.5],
  ['spot-danger', 'spot-cream', 4.5],
  ['spot-danger-dark', 'spot-white', 4.5],
  ['spot-success', 'spot-white', 4.5],
  ['spot-warning-ink', 'spot-white', 4.5],
  // Superfície invertida (chip selecionado, botão secundário).
  ['spot-on-black', 'spot-black', 4.5],
  // Botão primário e tudo que é escrito sobre o amarelo.
  ['spot-on-yellow', 'spot-yellow', 4.5],
  // Barra de navegação.
  ['spot-sidebar-text', 'spot-sidebar', 4.5],
];

describe.each([
  ['claro', claro],
  ['escuro', escuro],
] as const)('paleta %s', (_nome, paleta) => {
  it.each(PARES)('%s sobre %s passa de %d:1', (texto, fundo, minimo) => {
    expect(paleta[texto], texto).toBeDefined();
    expect(paleta[fundo], fundo).toBeDefined();
    expect(contrastRatio(paleta[texto], paleta[fundo])).toBeGreaterThanOrEqual(minimo);
  });
});

describe('modo escuro', () => {
  it('troca de fato a página, o cartão e o texto', () => {
    for (const k of ['spot-cream', 'spot-white', 'spot-gray-900', 'spot-black', 'spot-on-black']) {
      expect(escuro[k], k).not.toBe(claro[k]);
    }
  });
  it('mantém o texto sobre o amarelo escuro nos dois modos', () => {
    expect(escuro['spot-on-yellow']).toBe(claro['spot-on-yellow']);
  });
});
