'use client';

import {
  FILTROS_VAZIOS, ORDENS_EQUIPE, filtrosAtivos, opcoesDe, type FiltrosEquipe, type OrdemEquipe,
} from '@/lib/gestorEquipe';

const TURNOS: { valor: FiltrosEquipe['turno']; rotulo: string }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'DIA', rotulo: 'Diurno' },
  { valor: 'NOITE', rotulo: 'Noturno' },
];

export interface OpcaoFiltro { valor: string; rotulo: string }

const ROTULO = 'font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500';

/**
 * Pesquisa e filtros da lista de colaboradores, no mesmo padrão da aba de
 * consulta do admin: busca por texto, seletores e chips. Um seletor só aparece
 * quando há mais de uma opção — com uma unidade só, filtrar por unidade não
 * diz nada.
 *
 * Os filtros se combinam (todos valem ao mesmo tempo) e a lista atualiza na
 * hora, sem botão de aplicar. Cada tela diz quais filtros extras quer
 * (situação, etapa, responsável, período de admissão, ordenação) passando as
 * opções; sem elas, o filtro nem aparece.
 */
export function FiltrosEquipeBar({
  valor, onChange, pessoas, comSetor = true,
  statusOpcoes, rotuloStatus = 'Situação', etapaOpcoes, rotuloEtapa = 'Etapa',
  responsaveis, rotuloResponsavel = 'Responsável',
  comPeriodo = false, comOrdem = false, encontrados, totalGeral,
}: {
  valor: FiltrosEquipe;
  onChange: (v: FiltrosEquipe) => void;
  pessoas: { unit: { name: string } | null; sector: { name: string } | null }[];
  /** Sem seletor de setor quando a tela já tem uma aba por setor. */
  comSetor?: boolean;
  statusOpcoes?: OpcaoFiltro[];
  rotuloStatus?: string;
  etapaOpcoes?: OpcaoFiltro[];
  rotuloEtapa?: string;
  /** Nomes que podem ser escolhidos como responsável; sem lista, o filtro não aparece. */
  responsaveis?: string[];
  rotuloResponsavel?: string;
  comPeriodo?: boolean;
  comOrdem?: boolean;
  /** Quantos a lista mostra agora (já filtrada) e quantos existem sem filtro. */
  encontrados?: number;
  totalGeral?: number;
}) {
  const unidades = opcoesDe(pessoas.map((p) => p.unit?.name));
  const setores = opcoesDe(pessoas.map((p) => p.sector?.name));
  const ativos = filtrosAtivos(valor);
  const set = (parcial: Partial<FiltrosEquipe>) => onChange({ ...valor, ...parcial });
  const nomes = responsaveis ? opcoesDe(responsaveis) : [];

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
            <span className={ROTULO}>Unidade</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.unidade} onChange={(e) => set({ unidade: e.target.value })}>
              <option value="">Todas</option>
              {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        )}

        {comSetor && setores.length > 1 && (
          <label className="block min-w-0">
            <span className={ROTULO}>Setor</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.setor} onChange={(e) => set({ setor: e.target.value })}>
              <option value="">Todos</option>
              {setores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        {statusOpcoes && statusOpcoes.length > 0 && (
          <label className="block min-w-0">
            <span className={ROTULO}>{rotuloStatus}</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Todas</option>
              {statusOpcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
        )}

        {etapaOpcoes && etapaOpcoes.length > 0 && (
          <label className="block min-w-0">
            <span className={ROTULO}>{rotuloEtapa}</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.etapa} onChange={(e) => set({ etapa: e.target.value })}>
              <option value="">Todas</option>
              {etapaOpcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
        )}

        {nomes.length > 0 && (
          <label className="block min-w-0">
            <span className={ROTULO}>{rotuloResponsavel}</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.responsavel} onChange={(e) => set({ responsavel: e.target.value })}>
              <option value="">Todos</option>
              {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}

        <fieldset className="flex flex-col gap-1.5 min-w-0">
          <legend className={`${ROTULO} mb-1.5`}>Turno</legend>
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

        {comPeriodo && (
          <fieldset className="min-w-0">
            <legend className={`${ROTULO} mb-1`}>Admitidos entre</legend>
            <div className="flex items-center gap-2">
              <label>
                <span className="sr-only">Admissão a partir de</span>
                <input type="date" className="input !w-auto text-sm" value={valor.admissaoDe} max={valor.admissaoAte || undefined} onChange={(e) => set({ admissaoDe: e.target.value })} />
              </label>
              <span aria-hidden className="text-spot-gray-500 text-sm">até</span>
              <label>
                <span className="sr-only">Admissão até</span>
                <input type="date" className="input !w-auto text-sm" value={valor.admissaoAte} min={valor.admissaoDe || undefined} onChange={(e) => set({ admissaoAte: e.target.value })} />
              </label>
            </div>
          </fieldset>
        )}

        {comOrdem && (
          <label className="block min-w-0">
            <span className={ROTULO}>Ordenar por</span>
            <select className="input mt-1 !w-auto text-sm" value={valor.ordem} onChange={(e) => set({ ordem: e.target.value as OrdemEquipe })}>
              {ORDENS_EQUIPE.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
        )}

        {(ativos > 0 || valor.ordem !== '') && (
          <button type="button" className="btn-ghost text-xs py-1.5 px-3 min-h-10" onClick={() => onChange(FILTROS_VAZIOS)}>
            Limpar filtros{ativos > 0 ? ` (${ativos})` : ''}
          </button>
        )}
      </div>

      {encontrados !== undefined && (
        <p role="status" aria-live="polite" className="text-xs text-spot-gray-600">
          {encontrados === 1 ? '1 colaborador encontrado' : `${encontrados} colaboradores encontrados`}
          {totalGeral !== undefined && ativos > 0 ? ` de ${totalGeral}` : ''}
        </p>
      )}
    </div>
  );
}
