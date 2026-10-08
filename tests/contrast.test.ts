import { describe, it, expect } from 'vitest';
import { contrastRatio, contrastLevel, hexToRgb, checkPair } from '../src/lib/contrast';
import { colorFor, textColorFor } from '../src/components/charts/Heatmap';

describe('hexToRgb', () => {
  it('lê hex de 6 dígitos', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#F5C400')).toEqual({ r: 245, g: 196, b: 0 });
  });

  it('devolve null para entrada inválida', () => {
    expect(hexToRgb('azul')).toBeNull();
    expect(hexToRgb('#FFF')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('preto sobre branco é o contraste máximo (21:1)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('a mesma cor não tem contraste (1:1)', () => {
    expect(contrastRatio('#F5C400', '#F5C400')).toBeCloseTo(1, 5);
  });

  it('é simétrico — a ordem das cores não muda a razão', () => {
    expect(contrastRatio('#0B0B0B', '#F5C400')).toBeCloseTo(contrastRatio('#F5C400', '#0B0B0B'), 5);
  });
});

describe('contrastLevel', () => {
  it('classifica pelas faixas do WCAG', () => {
    expect(contrastLevel(21)).toBe('ok');
    expect(contrastLevel(4.5)).toBe('ok');
    expect(contrastLevel(4.4)).toBe('baixo');
    expect(contrastLevel(3)).toBe('baixo');
    expect(contrastLevel(2.9)).toBe('critico');
    expect(contrastLevel(1)).toBe('critico');
  });
});

describe('checkPair', () => {
  it('pega o caso real que quebrou o site: texto branco em cartão branco', () => {
    const r = checkPair('Título sobre cartão', '#ffffff', '#ffffff');
    expect(r.level).toBe('critico');
  });

  it('aprova a combinação padrão do Spot (preto sobre amarelo)', () => {
    expect(checkPair('Texto sobre primária', '#0B0B0B', '#F5C400').level).toBe('ok');
  });
});

describe('heatmap: texto legível em toda faixa', () => {
  // O heatmap é a única tela que pinta número sobre cor forte. A regra
  // "fundo forte = texto branco" reprovava em duas faixas (2.98:1 e 4.38:1);
  // este teste trava o par de cada faixa no mínimo do WCAG AA.
  const amostras = [null, 0, 30, 49, 50, 64, 65, 74, 75, 84, 85, 100];

  it.each(amostras)('índice %s passa em 4.5:1', (index) => {
    const ratio = contrastRatio(textColorFor(index), colorFor(index));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('cada faixa usa a cor de texto que mede melhor sobre o próprio fundo', () => {
    for (const index of amostras) {
      const fundo = colorFor(index);
      const escolhido = contrastRatio(textColorFor(index), fundo);
      const alternativas = ['#FFFFFF', '#000000', '#1A1A1A', '#54544F'].map((c) => contrastRatio(c, fundo));
      // Não precisa ser o máximo absoluto, mas não pode existir alternativa
      // que passe em AA quando a escolhida reprova.
      expect(escolhido >= 4.5 || alternativas.every((r) => r < 4.5)).toBe(true);
    }
  });
});
