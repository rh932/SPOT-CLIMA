'use client';

interface HeatmapCell {
  sectorId: string;
  sector: string;
  dimensionId: string;
  dimension: string;
  index: number | null;
  visible: boolean;
}

export function colorFor(index: number | null): string {
  if (index === null) return '#F2F2F0';
  if (index >= 85) return '#0F7A3D';
  if (index >= 75) return '#4FA84B';
  if (index >= 65) return '#E8B400';
  if (index >= 50) return '#E27A2E';
  return '#D64545';
}

/**
 * Cor do texto da célula: a que passa no WCAG AA (4.5:1) sobre CADA fundo de
 * colorFor, medida com contrastRatio() de src/lib/contrast.ts. A regra
 * intuitiva "fundo forte = texto branco" não vale aqui: só o verde >=85 é
 * escuro o bastante para branco; nas faixas do meio o branco dava de 1.9 a
 * 3.0:1, ou seja, número ilegível sobre a própria cor que deveria destacá-lo.
 *
 *   >=85  #0F7A3D  branco   5.42:1
 *   75-84 #4FA84B  #1A1A1A  5.83:1   (branco daria 2.99:1)
 *   65-74 #E8B400  #1A1A1A  9.08:1   (branco daria 1.92:1)
 *   50-64 #E27A2E  #1A1A1A  5.85:1   (branco daria 2.98:1)
 *   <50   #D64545  #000000  4.80:1   (branco 4.38:1 e #1A1A1A 3.98:1 reprovam)
 *   vazia #F2F2F0  #54544F  6.79:1   (o #9C9C95 anterior dava 2.46:1)
 *
 * O preto puro na faixa <50 é proposital: #D64545 (Desfavorável) fica no meio
 * da escala de luminância e nenhum outro tom da paleta chega a 4.5:1 sobre
 * ele — #1A1A1A para em 3.98 e o próprio #0B0B0B em 4.4955. Se um dia a marca
 * aceitar escurecer o Desfavorável (#C93A3A dá 5.06:1 com branco), a faixa
 * volta a usar branco como as demais.
 */
export function textColorFor(index: number | null): string {
  if (index === null) return '#54544F';
  if (index >= 85) return '#FFFFFF';
  if (index >= 50) return '#1A1A1A';
  return '#000000';
}

export function Heatmap({ cells, rowLabel = 'Setor' }: { cells: HeatmapCell[]; rowLabel?: string }) {
  const sectors = Array.from(new Set(cells.map((c) => c.sector)));
  const dimensions = Array.from(new Set(cells.map((c) => c.dimension)));

  const get = (sector: string, dimension: string) => cells.find((c) => c.sector === sector && c.dimension === dimension);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs min-w-[640px]">
        <thead>
          <tr>
            <th className="text-left font-semibold text-spot-gray-600 px-2 py-1 sticky left-0 bg-spot-white">{rowLabel}</th>
            {dimensions.map((d) => (
              <th key={d} className="font-semibold text-spot-gray-600 px-2 py-1 text-center max-w-[100px]">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => (
            <tr key={s}>
              <td className="font-medium text-spot-gray-800 px-2 py-1 whitespace-nowrap sticky left-0 bg-spot-white">{s}</td>
              {dimensions.map((d) => {
                const cell = get(s, d);
                const value = cell?.visible ? cell.index : null;
                return (
                  <td key={d} className="p-0">
                    <div
                      title={cell?.visible ? `${value}%` : 'Oculto (anonimato)'}
                      className="rounded-sm h-12 w-full min-w-[64px] flex items-center justify-center font-mono text-[13px] font-medium tabular"
                      style={{ background: colorFor(value), color: textColorFor(value) }}
                    >
                      {value !== null ? `${value}%` : '—'}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
