/**
 * Contraste WCAG entre duas cores hex — é com isto que se medem as cores do
 * globals.css (claro e escuro) e as faixas do mapa de calor. Nasceu na antiga
 * Personalização, depois que um tema salvo deixou texto branco sobre fundo
 * branco.
 *
 * Ver também tests/contrast.test.ts, que trava as faixas do mapa de calor.
 */

export interface Rgb { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Luminância relativa (WCAG 2.1). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste entre 1 (nenhum) e 21 (preto sobre branco). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastLevel = 'ok' | 'baixo' | 'critico';

/**
 * 4.5:1 é o mínimo do WCAG AA para texto normal; abaixo de 3:1 o texto fica
 * praticamente ilegível (é onde cai branco-sobre-branco).
 */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 4.5) return 'ok';
  if (ratio >= 3) return 'baixo';
  return 'critico';
}

export interface ContrastCheck {
  label: string;
  ratio: number;
  level: ContrastLevel;
}

export function checkPair(label: string, foreground: string, background: string): ContrastCheck {
  const ratio = contrastRatio(foreground, background);
  return { label, ratio, level: contrastLevel(ratio) };
}
