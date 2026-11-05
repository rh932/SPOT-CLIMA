'use client';

import { FILTROS_VAZIOS, filtrosAtivos, opcoesDe, type FiltrosEquipe } from '@/lib/gestorEquipe';

const TURNOS: { valor: FiltrosEquipe['turno']; rotulo: string }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'DIA', rotulo: 'Diurno' },
  { valor: 'NOITE', rotulo: 'Noturno' },
];

/**
 * Pesquisa e filtros da lista de colaboradores, no mesmo padrão da aba de
 * consulta do admin: busca por texto, seletores e chips. Um seletor só aparece
 * quando há mais de uma opção — com uma unidade só, filtrar por unidade não
 * diz nada.
 */
export function FiltrosEquipeBar({
  valor, onChange, pessoas, comSetor = true,
}: {
  valor: FiltrosEquipe;
  onChange: (v: FiltrosEquipe) => void;
  pessoas: { unit: { name: string } | null; sector: { name: string } | null }[];
  /** Sem seletor de setor quando a tela já tem uma aba por setor. */
  comSetor?: boolean;
}) {
  const unidades = opcoesDe(pessoas.map((p) => p.unit?.name));
  const setores = opcoesDe(pessoas.map((p) => p.sector?.name));
  const ativos = filtrosAtivos(valor);
  const set = (parcial: Partial<FiltrosEquipe>) => onChange({ ...valor, ...parcial });

  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="sr-only">Buscar colaborador por nome, cargo ou setor</span>
        <input
          type="search"
          className="input"
          placeholder="Buscar por nome, cargo ou setor..."
          value={valor.busca}
          onChange={(e) => set({ busca: e.target.value })}
        />
      </label>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {unidades.length > 1 && (
          <label className="block min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Unidade</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.unidade} onChange={(e) => set({ unidade: e.target.value })}>
              <option value="">Todas</option>
              {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        )}

        {comSetor && setores.length > 1 && (
          <label className="block min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Setor</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.setor} onChange={(e) => set({ setor: e.target.value })}>
              <option value="">Todos</option>
              {setores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        <fieldset className="flex flex-col gap-1.5 min-w-0">
          <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1.5">Turno</legend>
          <div className="flex flex-wrap gap-1.5">
            {TURNOS.map((t) => {
              const ativo = valor.turno === t.valor;
              return (
                <button
                  key={t.rotulo}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => set({ turno: t.valor })}
                  className={`badge min-h-10 transition ${
                    ativo ? 'bg-spot-black text-spot-onBlack' : 'bg-spot-gray-100 text-spot-gray-600 hover:bg-spot-gray-200'
                  }`}
                >
                  {t.rotulo}
                </button>
              );
            })}
          </div>
        </fieldset>

        {ativos > 0 && (
          <button type="button" className="btn-ghost text-xs py-1.5 px-3 min-h-10" onClick={() => onChange(FILTROS_VAZIOS)}>
            Limpar filtros ({ativos})
          </button>
        )}
      </div>
    </div>
  );
}
