'use client';

export function WordCloud({ words }: { words: { word: string; count: number }[] }) {
  if (words.length === 0) {
    return <p className="text-sm text-spot-gray-500">Sem dados suficientes para gerar a nuvem de palavras.</p>;
  }
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));

  const sizeFor = (count: number) => {
    if (max === min) return 20;
    const t = (count - min) / (max - min);
    return 13 + t * 26; // 13px a 39px
  };

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 items-center justify-center py-4">
      {/* Serifa: a nuvem é o único gráfico feito só de palavras, e é onde a
          fonte de título do sistema tem mais efeito. */}
      {words.map((w) => (
        <span
          key={w.word}
          style={{ fontSize: `${sizeFor(w.count)}px`, opacity: 0.55 + 0.45 * (w.count / max) }}
          className="font-display font-semibold text-spot-black leading-none"
          title={`${w.count} ocorrências`}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}
