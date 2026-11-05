'use client';

import {
  FILTROS_VAZIOS, ORDENS_EQUIPE, filtrosAtivos, opcoesDe, type FiltrosEquipe, type OrdemEquipe,
} from '@/lib/gestorEquipe';
import { BarraFiltros, CampoSelect, ROTULO_FILTRO } from '@/components/ui/BarraFiltros';

const TURNOS: { valor: FiltrosEquipe['turno']; rotulo: string }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'DIA', rotulo: 'Diurno' },
  { valor: 'NOITE', rotulo: 'Noturno' },
];

export interface OpcaoFiltro { valor: string; rotulo: string }

/**
 * Pesquisa e filtros da lista de colaboradores: a busca por nome fica à vista
 * e todo o resto — unidade, setor, situação, etapa, responsável, turno,
 * período de admissão e ordenação — fica atrás do botão "Filtros" (uma folha
 * que sobe de baixo no celular). Ver BarraFiltros.
 *
 * Os filtros se combinam (todos valem ao mesmo tempo) e a lista atualiza na
 * hora. Cada tela diz quais filtros extras quer passando as opções; sem elas,
 * o campo nem aparece. Um seletor só aparece quando há mais de uma opção — com
 * uma unidade só, filtrar por unidade não diz nada.
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
  const nomes = responsaveis ? opcoesDe(responsaveis) : [];
  const set = (parcial: Partial<FiltrosEquipe>) => onChange({ ...valor, ...parcial });

  // A busca já está à vista, então não entra na conta do botão; a ordenação entra.
  const ativos = filtrosAtivos(valor) - (valor.busca.trim() !== '' ? 1 : 0) + (valor.ordem !== '' ? 1 : 0);
  const filtrando = filtrosAtivos(valor) > 0;

  const resumo = encontrados === undefined
    ? undefined
    : `${encontrados === 1 ? '1 colaborador encontrado' : `${encontrados} colaboradores encontrados`}${
      totalGeral !== undefined && filtrando ? ` de ${totalGeral}` : ''}`;

  return (
    <BarraFiltros
      busca={valor.busca}
      onBusca={(busca) => set({ busca })}
      placeholder="Buscar por nome, cargo ou setor..."
      rotuloBusca="Buscar colaborador por nome, cargo ou setor"
      ativos={ativos}
      onLimpar={() => onChange(FILTROS_VAZIOS)}
      resumo={resumo}
      totalResultados={encontrados}
    >
      {unidades.length > 1 && (
        <CampoSelect rotulo="Unidade" valor={valor.unidade} onChange={(unidade) => set({ unidade })}>
          <option value="">Todas</option>
          {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
        </CampoSelect>
      )}

      {comSetor && setores.length > 1 && (
        <CampoSelect rotulo="Setor" valor={valor.setor} onChange={(setor) => set({ setor })}>
          <option value="">Todos</option>
          {setores.map((s) => <option key={s} value={s}>{s}</option>)}
        </CampoSelect>
      )}

      {statusOpcoes && statusOpcoes.length > 0 && (
        <CampoSelect rotulo={rotuloStatus} valor={valor.status} onChange={(status) => set({ status })}>
          <option value="">Todas</option>
          {statusOpcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </CampoSelect>
      )}

      {etapaOpcoes && etapaOpcoes.length > 0 && (
        <CampoSelect rotulo={rotuloEtapa} valor={valor.etapa} onChange={(etapa) => set({ etapa })}>
          <option value="">Todas</option>
          {etapaOpcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </CampoSelect>
      )}

      {nomes.length > 0 && (
        <CampoSelect rotulo={rotuloResponsavel} valor={valor.responsavel} onChange={(responsavel) => set({ responsavel })}>
          <option value="">Todos</option>
          {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
        </CampoSelect>
      )}

      <fieldset className="flex flex-col gap-1.5 min-w-0">
        <legend className={`${ROTULO_FILTRO} mb-1.5`}>Turno</legend>
        <div className="flex flex-wrap gap-1.5">
          {TURNOS.map((t) => {
            const ativo = valor.turno === t.valor;
            return (
              <button
                key={t.rotulo}
                type="button"
                aria-pressed={ativo}
                onClick={() => set({ turno: t.valor })}
                className={`badge min-h-11 px-4 transition ${
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
          <legend className={`${ROTULO_FILTRO} mb-1`}>Admitidos entre</legend>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="sr-only">Admissão a partir de</span>
              <input type="date" className="input w-full" value={valor.admissaoDe} max={valor.admissaoAte || undefined} onChange={(e) => set({ admissaoDe: e.target.value })} />
            </label>
            <label>
              <span className="sr-only">Admissão até</span>
              <input type="date" className="input w-full" value={valor.admissaoAte} min={valor.admissaoDe || undefined} onChange={(e) => set({ admissaoAte: e.target.value })} />
            </label>
          </div>
        </fieldset>
      )}

      {comOrdem && (
        <CampoSelect rotulo="Ordenar por" valor={valor.ordem} onChange={(ordem) => set({ ordem: ordem as OrdemEquipe })}>
          {ORDENS_EQUIPE.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </CampoSelect>
      )}
    </BarraFiltros>
  );
}
