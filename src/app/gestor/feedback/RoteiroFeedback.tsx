import {
  PILARES_ROTEIRO, COMPETENCIAS_ROTEIRO, PLANO_70_20_10, OBJETIVO_PROFISSIONAL, REVISAO_PDI_MESES,
} from '@/data/roteiroPdi';

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-spot-gray-800">
      {itens.map((i) => <li key={i}>{i}</li>)}
    </ul>
  );
}

/**
 * Consulta rápida do roteiro de feedback (PDI) de Paulista e JK. O conteúdo vem
 * de data/roteiroPdi.ts — o mesmo banco do formulário, para os dois não divergirem.
 */
export function RoteiroFeedback() {
  return (
    <details className="rounded-card border border-spot-gray-300 group">
      <summary className="cursor-pointer select-none min-h-11 px-4 py-3 flex items-center justify-between gap-3">
        <span>
          <span className="block font-semibold text-sm">Roteiro do feedback · Paulista e JK</span>
          <span className="block text-xs text-spot-gray-500">
            Plano de Desenvolvimento Individual (PDI), com revisão a cada {REVISAO_PDI_MESES} meses. É o que se preenche ao fazer o feedback nessas unidades.
          </span>
        </span>
        <span aria-hidden className="text-spot-gray-500 text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>

      <div className="px-4 pb-5 pt-1 flex flex-col gap-5 border-t border-spot-gray-300">
        <section className="pt-4">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-800 mb-2">Avaliação de desempenho</h3>
          <p className="text-sm text-spot-gray-800 mb-3">Cada item recebe uma nota (Ótimo, Bom, Regular ou Ruim), nos três pilares:</p>
          <div className="grid gap-4 md:grid-cols-3">
            {PILARES_ROTEIRO.map((p, idx) => (
              <div key={p.key} className="flex flex-col gap-2">
                <p className="text-sm font-semibold">{idx + 1}. {p.nome}</p>
                {p.grupos.map((g, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    {g.nome && <p className="text-xs font-semibold text-spot-gray-500">{g.nome}</p>}
                    <Lista itens={g.itens.map((it) => it.text)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-800 mb-2">Plano de desenvolvimento</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">1. Objetivo profissional</p>
              <p className="text-sm text-spot-gray-800">{OBJETIVO_PROFISSIONAL}</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">2. Competências a desenvolver</p>
              {(['Técnicas', 'Comportamentais'] as const).map((grupo) => (
                <div key={grupo} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-spot-gray-500">{grupo}</p>
                  <Lista itens={COMPETENCIAS_ROTEIRO.filter((c) => c.grupo === grupo).map((c) => c.text)} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">3. Plano de ação (metodologia 70/20/10)</p>
              {PLANO_70_20_10.map((parte) => (
                <div key={parte.key} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-spot-gray-500">{parte.titulo}</p>
                  <p className="text-sm text-spot-gray-800">{parte.dicas}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </details>
  );
}
