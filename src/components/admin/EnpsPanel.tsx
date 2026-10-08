import type { EnpsGroup, EnpsResult } from '@/lib/results';

/**
 * eNPS da pesquisa: o número, a divisão entre promotores/neutros/detratores e
 * o recorte por setor e unidade (com os mesmos grupos ocultos do resto do
 * painel — ver computeEnpsResult em src/lib/results.ts).
 */
export function EnpsPanel({ enps }: { enps: EnpsResult }) {
  const sinal = enps.score > 0 ? `+${enps.score}` : String(enps.score);
  return (
    <div className="card flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">eNPS</p>
          <p className="font-display text-5xl font-semibold leading-none mt-1">{sinal}</p>
          <p className="text-sm mt-1 inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: enps.classification.color }} />
            {enps.classification.zone} · {enps.respondents} respostas
          </p>
        </div>
        <div className="flex-1 min-w-[16rem]">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-spot-gray-100" role="img"
            aria-label={`Promotores ${enps.promoters}%, neutros ${enps.passives}%, detratores ${enps.detractors}%`}>
            <span style={{ width: `${enps.promoters}%`, background: '#0f7a3d' }} />
            <span style={{ width: `${enps.passives}%`, background: '#c9c4b8' }} />
            <span style={{ width: `${enps.detractors}%`, background: '#d64545' }} />
          </div>
          <dl className="grid grid-cols-3 gap-2 mt-2 text-xs">
            <div><dt className="text-spot-gray-500">Promotores (9–10)</dt><dd className="font-semibold text-sm">{enps.promoters}%</dd></div>
            <div><dt className="text-spot-gray-500">Neutros (7–8)</dt><dd className="font-semibold text-sm">{enps.passives}%</dd></div>
            <div><dt className="text-spot-gray-500">Detratores (0–6)</dt><dd className="font-semibold text-sm">{enps.detractors}%</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Grupos titulo="Por setor" grupos={enps.bySector} />
        <Grupos titulo="Por unidade" grupos={enps.byUnit} />
      </div>
      <p className="text-xs text-spot-gray-500">
        eNPS = % promotores − % detratores, de −100 a +100. Acima de 0 já há mais promotores que detratores;
        50 ou mais é zona de qualidade.
      </p>
    </div>
  );
}

function Grupos({ titulo, grupos }: { titulo: string; grupos: EnpsGroup[] }) {
  if (grupos.length === 0) return null;
  return (
    <div>
      <p className="font-semibold text-sm mb-2">{titulo}</p>
      <ul className="flex flex-col divide-y divide-spot-gray-100">
        {grupos.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="truncate">{g.name}</span>
            {g.visible && g.score !== null ? (
              <span className="font-semibold tabular-nums">{g.score > 0 ? `+${g.score}` : g.score}</span>
            ) : (
              <span className="text-xs text-spot-gray-500">oculto (anonimato)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
