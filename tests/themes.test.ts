import { describe, it, expect } from 'vitest';
import { classifyComment, classifySentiment, countByTheme } from '../src/lib/themes';

describe('classifyComment', () => {
  it('classifica comentário sobre liderança', () => {
    expect(classifyComment('Meu líder poderia dar mais feedback')).toContain('Liderança');
  });
  it('classifica comentário sobre escala/jornada', () => {
    expect(classifyComment('A escala muda em cima da hora')).toContain('Escala');
  });
  it('cai em "Outros" quando não casa com nenhum tema', () => {
    expect(classifyComment('xyzabc123 texto sem sentido nenhum')).toEqual(['Outros']);
  });
});

describe('classifySentiment', () => {
  it('identifica sugestão', () => {
    expect(classifySentiment('Sugiro criar mais treinamentos')).toBe('sugestao');
  });
  it('identifica elogio', () => {
    expect(classifySentiment('O ambiente aqui é ótimo, gosto muito')).toBe('elogio');
  });
});

describe('countByTheme', () => {
  it('conta ocorrências por tema, incluindo comentários com múltiplos temas', () => {
    const counts = countByTheme([
      'Meu líder não me dá feedback',
      'A escala e a jornada estão pesadas',
      'Tudo ótimo por aqui',
    ]);
    const liderancaCount = counts.find((c) => c.theme === 'Liderança')?.count;
    expect(liderancaCount).toBe(1);
  });
});
