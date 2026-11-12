import { describe, it, expect } from 'vitest';
import { buildWordFrequencies } from '../src/lib/wordcloud';

describe('buildWordFrequencies', () => {
  it('ignora stopwords e palavras curtas', () => {
    const freqs = buildWordFrequencies(['a comunicação e a escala precisam melhorar', 'a comunicação precisa melhorar muito']);
    const words = freqs.map((f) => f.word);
    expect(words).not.toContain('a');
    expect(words).not.toContain('e');
    expect(words).toContain('comunicacao');
  });

  it('exige repetição mínima para reduzir risco de termos únicos identificáveis', () => {
    const freqs = buildWordFrequencies(['palavraunica apenas uma vez aqui']);
    expect(freqs.find((f) => f.word === 'palavraunica')).toBeUndefined();
  });
});
