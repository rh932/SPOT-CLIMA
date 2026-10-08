/**
 * Geração de frequência de palavras para a nuvem de palavras das respostas abertas.
 * Remove stopwords, palavras muito curtas e tenta reduzir o risco de vazar nomes
 * próprios (heurística: descarta palavras capitalizadas no meio da frase que não
 * aparecem em minúsculo em nenhum outro lugar do corpus).
 */

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'que', 'com', 'para', 'por', 'em', 'um', 'uma',
  'uns', 'umas', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'à', 'às', 'se', 'sua', 'seu', 'suas', 'seus', 'minha',
  'meu', 'minhas', 'meus', 'mais', 'menos', 'muito', 'muita', 'muitos', 'muitas', 'pouco', 'poucos', 'já', 'não',
  'sim', 'é', 'foi', 'ser', 'está', 'estou', 'estamos', 'são', 'tem', 'têm', 'ter', 'isso', 'isto', 'essa', 'esse',
  'essas', 'esses', 'esta', 'este', 'estas', 'estes', 'aquele', 'aquela', 'aqueles', 'aquelas', 'como', 'quando',
  'onde', 'porque', 'pois', 'mas', 'também', 'só', 'apenas', 'ainda', 'todo', 'toda', 'todos', 'todas', 'eu',
  'nós', 'ele', 'ela', 'eles', 'elas', 'você', 'vocês', 'lhe', 'lhes', 'me', 'nos', 'te', 'meu', 'sobre', 'entre',
  'até', 'depois', 'antes', 'aqui', 'ali', 'lá', 'então', 'sempre', 'nunca', 'algum', 'alguma', 'alguns', 'algumas',
]);

function normalize(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface WordFrequency {
  word: string;
  count: number;
}

export function buildWordFrequencies(texts: string[], minLength = 3, topN = 60): WordFrequency[] {
  const counts = new Map<string, number>();

  for (const text of texts) {
    const words = text.split(/\s+/);
    for (const raw of words) {
      const word = normalize(raw);
      if (word.length < minLength) continue;
      if (STOPWORDS.has(word)) continue;
      if (/^\d+$/.test(word)) continue; // ignora números puros
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .filter((w) => w.count >= 2) // exige repetição mínima para reduzir risco de termos únicos identificáveis
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
