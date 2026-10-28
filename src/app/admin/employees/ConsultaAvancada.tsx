'use client';

/**
 * Consulta avançada da avaliação de experiência — o lugar do "Quadro de
 * Admissões e Demissões" que o DP mantinha em planilha.
 *
 * Tudo é calculado de `src/lib/experienceReport.ts`, a mesma função que a
 * exportação usa no servidor: o Excel baixado é exatamente a lista na tela.
 * Os filtros moram na URL, então uma consulta pode ser salva nos favoritos ou
 * mandada para outra pessoa do RH.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  activeFilterCount, buildReportRow, CONSULTA_PARAM_KEYS, filtersFromParams, filtersToParams, matchesFilters, periodText, sortRows, summarize,
  CLASSIFICATION_LABELS, CLASSIFICATION_SCORE, CONCLUSION_LABELS, EMPTY_FILTERS, SITUATION_LABELS,
  type Classification, type Conclusion, type PeriodCell, type ReportEmployeeInput, type ReportFilters, type ReportRow,
  type Situation, type SortKey,
} from '@/lib/experienceReport';
import { TERMINATION_LABELS, TERMINATION_REASONS, type TerminationReason } from '@/lib/termination';

interface Lookup { id: string; name: string }

const formatDate = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const SITUATIONS = Object.keys(SITUATION_LABELS) as Situation[];
const CONCLUSIONS: (Conclusion | 'SEM')[] = ['EFETIVAR', 'EXTENDER', 'DEMITIR', 'SEM'];
const CLASSIFICATIONS: (Classification | 'SEM')[] = ['EXCELENTE_AQUISICAO', 'OTIMAS_PERSPECTIVAS', 'ALGUMAS_POSSIBILIDADES', 'FRACO', 'SEM'];
const PONTO_SITUACAO: Record<Situation, string> = {
  AGUARDANDO_1: '#E8B400', AGUARDANDO_2: '#E8B400', EFETIVADO: '#0F7A3D', DESLIGADO: '#9C9C95', APRENDIZ: '#4F7FBF',
};
const PAGINA = 100;

function toggle<T>(lista: T[], v: T): T[] {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`badge min-h-10 transition ${ativo ? 'bg-spot-black text-spot-onBlack' : 'bg-spot-gray-100 text-spot-gray-600 hover:bg-spot-gray-200'}`}
    >
      {children}
    </button>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5 min-w-0">
      <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1.5">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function Selecao({
  rotulo, value, onChange, children,
}: { rotulo: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">{rotulo}</span>
      <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </label>
  );
}

const ENTREGA_LABELS: Record<Exclude<ReportFilters['delivery'], ''>, string> = {
  NO_PRAZO: 'Entregue no prazo', FORA_DO_PRAZO: 'Entregue fora do prazo', SEM_AVALIACAO: 'Sem avaliação entregue',
};

function CelulaPeriodo({ c }: { c: PeriodCell }) {
  if (c.state === 'NAO_SE_APLICA') return <span className="text-spot-gray-400">—</span>;
  const cor = c.state === 'ATRASADA' || c.state === 'FORA_DO_PRAZO'
    ? 'text-[#C93A3A] font-semibold'
    : c.state === 'PENDENTE' && c.days <= 7 ? 'text-spot-gray-800 font-semibold' : 'text-spot-gray-600';
  const primeira = c.evaluations[0];
  return (
    <div className="flex flex-col leading-tight">
      <span className={cor}>{periodText(c)}</span>
      <span className="text-[11px] text-spot-gray-500">
        {primeira
          ? <>{formatDate(primeira.date)}{primeira.conclusion ? ` · ${CONCLUSION_LABELS[primeira.conclusion]}` : ''}</>
          : <>até {formatDate(c.due)}</>}
        {c.evaluations.length > 1 && ` · ${c.evaluations.length} respostas`}
      </span>
    </div>
  );
}

function Cab({
  k, ordem, sentido, onSort, children,
}: { k: SortKey; ordem: SortKey; sentido: 'asc' | 'desc'; onSort: (k: SortKey) => void; children: React.ReactNode }) {
  return (
    <th scope="col" className="py-2 pr-3 font-normal" aria-sort={ordem === k ? (sentido === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-spot-gray-900 transition">
        {children}
        <span aria-hidden className="text-[10px]">{ordem === k ? (sentido === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

function Situacao({ r }: { r: ReportRow }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: PONTO_SITUACAO[r.situation] }} />
      {SITUATION_LABELS[r.situation]}
    </span>
  );
}

export function ConsultaAvancada({
  employees, units, sectors,
}: { employees: ReportEmployeeInput[]; units: Lookup[]; sectors: Lookup[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filtros = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params]);
  const ordem = (params.get('ordem') as SortKey | null) ?? 'admissao';
  const sentido = params.get('sentido') === 'asc' ? 'asc' : 'desc';
  const [limite, setLimite] = useState(PAGINA);

  /** Escreve na URL preservando a aba e a ordenação (ver erro "router.replace com caminho literal"). */
  const aplicar = (f: ReportFilters, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(params.toString());
    for (const k of [...CONSULTA_PARAM_KEYS, 'ordem', 'sentido']) p.delete(k);
    filtersToParams(f).forEach((v, k) => p.set(k, v));
    p.set('aba', 'consulta');
    const o = extra.ordem ?? ordem;
    const s = extra.sentido ?? sentido;
    if (o !== 'admissao') p.set('ordem', o);
    if (s !== 'desc') p.set('sentido', s);
    setLimite(PAGINA);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const mudar = (parcial: Partial<ReportFilters>) => aplicar({ ...filtros, ...parcial });
  const mudarRef = useRef(mudar);
  mudarRef.current = mudar;

  const agora = useMemo(() => new Date(), []);
  const todas = useMemo(() => employees.map((e) => buildReportRow(e, agora)), [employees, agora]);
  const linhas = useMemo(
    () => sortRows(todas.filter((r) => matchesFilters(r, filtros)), ordem, sentido),
    [todas, filtros, ordem, sentido],
  );
  const resumo = useMemo(() => summarize(linhas), [linhas]);
  const avaliadores = useMemo(
    () => [...new Set(todas.flatMap((r) => r.evaluators))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [todas],
  );
  const anos = useMemo(
    () => [...new Set(todas.map((r) => r.admission.getUTCFullYear()))].sort((a, b) => b - a),
    [todas],
  );
  const nFiltros = activeFilterCount(filtros);
  // Abre sozinho quando o link já chega com um filtro que mora nele.
  const [maisAberto, setMaisAberto] = useState(() =>
    filtros.shifts.length > 0 || filtros.delivery !== '' || filtros.conclusions.length > 0 || filtros.classifications.length > 0
    || filtros.evaluator !== '' || filtros.multipleEvaluators || filtros.terminationReasons.length > 0);

  // A busca escreve na URL depois de uma pausa na digitação, não a cada tecla.
  const [busca, setBusca] = useState(filtros.q);
  const ultimaQ = useRef(filtros.q);
  useEffect(() => {
    if (filtros.q !== ultimaQ.current) { ultimaQ.current = filtros.q; setBusca(filtros.q); }
  }, [filtros.q]);
  useEffect(() => {
    if (busca === filtros.q) return;
    // mudarRef: o timer pode disparar depois de um chip ou ordenação trocados
    // no meio da digitação; a versão capturada no render desfaria essa troca.
    const t = setTimeout(() => { ultimaQ.current = busca; mudarRef.current({ q: busca }); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const ordenarPor = (k: SortKey) => {
    const novoSentido = ordem === k ? (sentido === 'asc' ? 'desc' : 'asc') : (k === 'nome' || k === 'prazo' ? 'asc' : 'desc');
    aplicar(filtros, { ordem: k, sentido: novoSentido });
  };
  const cab = { ordem, sentido: sentido as 'asc' | 'desc', onSort: ordenarPor };

  const exportar = () => {
    const p = filtersToParams(filtros);
    if (ordem !== 'admissao') p.set('ordem', ordem);
    if (sentido !== 'desc') p.set('sentido', sentido);
    window.location.assign(`/api/admin/employees/export?${p.toString()}`);
  };

  const anoSelecionado = (() => {
    const a = filtros.admissionFrom.slice(0, 4);
    return a && filtros.admissionFrom === `${a}-01-01` && filtros.admissionTo === `${a}-12-31` ? a : '';
  })();

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

  // Um valor por seletor. Uma lista com mais de um item só nasce de um link
  // montado à mão; aparece como "Vários" até alguém trocar.
  const umaOpcao = (lista: string[]) => (lista.length === 0 ? '' : lista.length === 1 ? lista[0] : 'VARIOS');
  const situacaoSelecionada = (() => {
    const s = [...filtros.situations].sort().join(',');
    if (s === 'AGUARDANDO_1,AGUARDANDO_2') return 'PENDENTES';
    return umaOpcao(filtros.situations);
  })();

  // O que fica em "Mais filtros" aparece como etiqueta removível: com o
  // painel fechado, é assim que se sabe que ainda há um recorte valendo.
  const etiquetas: { rotulo: string; limpar: Partial<ReportFilters> }[] = [
    ...filtros.shifts.map((s) => ({ rotulo: s === 'DIA' ? 'Diurno' : 'Noturno', limpar: { shifts: filtros.shifts.filter((x) => x !== s) } })),
    ...(!anoSelecionado && (filtros.admissionFrom || filtros.admissionTo)
      ? [{
        rotulo: `Admissão ${filtros.admissionFrom ? `de ${formatDate(new Date(`${filtros.admissionFrom}T00:00:00Z`))}` : ''} ${filtros.admissionTo ? `até ${formatDate(new Date(`${filtros.admissionTo}T00:00:00Z`))}` : ''}`.trim(),
        limpar: { admissionFrom: '', admissionTo: '' },
      }]
      : []),
    ...(filtros.delivery
      ? [{
        rotulo: `${ENTREGA_LABELS[filtros.delivery]}${filtros.deliveryPeriod ? ` (${filtros.deliveryPeriod}º período)` : ''}`,
        limpar: { delivery: '' as const, deliveryPeriod: '' as const },
      }]
      : []),
    ...filtros.conclusions.map((c) => ({
      rotulo: c === 'SEM' ? 'Sem conclusão' : CONCLUSION_LABELS[c],
      limpar: { conclusions: filtros.conclusions.filter((x) => x !== c) },
    })),
    ...filtros.classifications.map((c) => ({
      rotulo: c === 'SEM' ? 'Sem classificação' : CLASSIFICATION_LABELS[c],
      limpar: { classifications: filtros.classifications.filter((x) => x !== c) },
    })),
    ...(filtros.evaluator ? [{ rotulo: `Avaliador: ${filtros.evaluator}`, limpar: { evaluator: '' } }] : []),
    ...(filtros.multipleEvaluators ? [{ rotulo: 'Dois gestores avaliaram', limpar: { multipleEvaluators: false } }] : []),
    ...filtros.terminationReasons.map((m) => ({
      rotulo: TERMINATION_LABELS[m],
      limpar: { terminationReasons: filtros.terminationReasons.filter((x) => x !== m) },
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Busca + exportação */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[14rem]">
          <span className="label">Buscar por nome ou cargo</span>
          <input
            type="search"
            className="input"
            placeholder="Ex.: garçom, Beatriz..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <button type="button" className="btn-primary py-2.5 px-4" onClick={exportar} disabled={linhas.length === 0}>
          Baixar Excel ({linhas.length})
        </button>
      </div>

      {/* Os cinco recortes do dia a dia, sempre à vista. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Selecao rotulo="Loja" value={umaOpcao(filtros.units)} onChange={(v) => mudar({ units: v ? [v] : [] })}>
          <option value="">Todas</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          {filtros.units.length > 1 && <option value="VARIOS" disabled>Várias</option>}
        </Selecao>
        <Selecao rotulo="Setor" value={umaOpcao(filtros.sectors)} onChange={(v) => mudar({ sectors: v ? [v] : [] })}>
          <option value="">Todos</option>
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          {filtros.sectors.length > 1 && <option value="VARIOS" disabled>Vários</option>}
        </Selecao>
        <Selecao
          rotulo="Situação"
          value={situacaoSelecionada}
          onChange={(v) => mudar({ situations: v === 'PENDENTES' ? ['AGUARDANDO_1', 'AGUARDANDO_2'] : v ? [v as Situation] : [] })}
        >
          <option value="">Todas</option>
          <option value="PENDENTES">Em experiência (1º ou 2º)</option>
          {SITUATIONS.map((s) => <option key={s} value={s}>{SITUATION_LABELS[s]}</option>)}
          {situacaoSelecionada === 'VARIOS' && <option value="VARIOS" disabled>Várias</option>}
        </Selecao>
        <Selecao rotulo="Prazo" value={filtros.deadline} onChange={(v) => mudar({ deadline: v as ReportFilters['deadline'] })}>
          <option value="">Qualquer</option>
          <option value="ATRASADA">Atrasada</option>
          <option value="VENCE_7">Vence em 7 dias</option>
          <option value="VENCE_30">Vence em 30 dias</option>
          <option value="SEM_PENDENCIA">Sem pendência</option>
        </Selecao>
        <Selecao
          rotulo="Admissão"
          value={anoSelecionado || (filtros.admissionFrom || filtros.admissionTo ? 'PERIODO' : '')}
          onChange={(v) => mudar(v ? { admissionFrom: `${v}-01-01`, admissionTo: `${v}-12-31` } : { admissionFrom: '', admissionTo: '' })}
        >
          <option value="">Qualquer ano</option>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          {!anoSelecionado && (filtros.admissionFrom || filtros.admissionTo) && <option value="PERIODO" disabled>Período</option>}
        </Selecao>
      </div>

      {/* Mais filtros + o que está valendo */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-sm font-semibold underline underline-offset-4 decoration-spot-yellow decoration-2 min-h-10 pr-2"
          aria-expanded={maisAberto}
          aria-controls="mais-filtros"
          onClick={() => setMaisAberto((v) => !v)}
        >
          {maisAberto ? 'Menos filtros' : 'Mais filtros'}
        </button>
        {etiquetas.map((t) => (
          <button
            key={t.rotulo}
            type="button"
            onClick={() => mudar(t.limpar)}
            className="badge min-h-9 bg-spot-gray-100 text-spot-gray-800 hover:bg-spot-gray-200 transition"
            aria-label={`Tirar o filtro ${t.rotulo}`}
          >
            {t.rotulo} <span aria-hidden className="ml-1">×</span>
          </button>
        ))}
        {nFiltros > 0 && (
          <button type="button" className="text-sm text-spot-gray-500 hover:text-spot-gray-900 underline underline-offset-4 min-h-10 px-2" onClick={() => aplicar(EMPTY_FILTERS)}>
            Limpar tudo
          </button>
        )}
      </div>

      {maisAberto && (
        <div id="mais-filtros" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 rounded-xl2 bg-spot-white border border-spot-gray-200 p-5">
          <Grupo titulo="Turno">
            <div className="flex flex-wrap gap-2">
              <Chip ativo={filtros.shifts.includes('DIA')} onClick={() => mudar({ shifts: toggle(filtros.shifts, 'DIA') })}>Diurno</Chip>
              <Chip ativo={filtros.shifts.includes('NOITE')} onClick={() => mudar({ shifts: toggle(filtros.shifts, 'NOITE') })}>Noturno</Chip>
            </div>
          </Grupo>
          <Grupo titulo="Admitidos entre">
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" aria-label="Admitidos a partir de" value={filtros.admissionFrom} onChange={(e) => mudar({ admissionFrom: e.target.value })} />
              <input type="date" className="input" aria-label="Admitidos até" value={filtros.admissionTo} onChange={(e) => mudar({ admissionTo: e.target.value })} />
            </div>
          </Grupo>
          <Grupo titulo="Entrega da avaliação">
            <div className="flex flex-col gap-2">
              <select className="input" aria-label="Como foi entregue" value={filtros.delivery} onChange={(e) => mudar({ delivery: e.target.value as ReportFilters['delivery'] })}>
                <option value="">Qualquer</option>
                <option value="NO_PRAZO">No prazo</option>
                <option value="FORA_DO_PRAZO">Fora do prazo</option>
                <option value="SEM_AVALIACAO">Sem avaliação</option>
              </select>
              <select className="input" aria-label="Período da entrega" value={filtros.deliveryPeriod} onChange={(e) => mudar({ deliveryPeriod: e.target.value as ReportFilters['deliveryPeriod'] })}>
                <option value="">1º ou 2º</option>
                <option value="1">1º período</option>
                <option value="2">2º período</option>
              </select>
            </div>
          </Grupo>
          <Grupo titulo="Conclusão">
            <div className="flex flex-wrap gap-2">
              {CONCLUSIONS.map((c) => (
                <Chip key={c} ativo={filtros.conclusions.includes(c)} onClick={() => mudar({ conclusions: toggle(filtros.conclusions, c) })}>
                  {c === 'SEM' ? 'Sem avaliação' : CONCLUSION_LABELS[c]}
                </Chip>
              ))}
            </div>
          </Grupo>
          <Grupo titulo="Classificação">
            <select
              className="input"
              aria-label="Classificação"
              value={umaOpcao(filtros.classifications)}
              onChange={(e) => mudar({ classifications: e.target.value ? [e.target.value as Classification | 'SEM'] : [] })}
            >
              <option value="">Qualquer</option>
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>{c === 'SEM' ? 'Sem avaliação' : `${CLASSIFICATION_SCORE[c]} · ${CLASSIFICATION_LABELS[c]}`}</option>
              ))}
              {filtros.classifications.length > 1 && <option value="VARIOS" disabled>Várias</option>}
            </select>
          </Grupo>
          <Grupo titulo="Avaliador">
            <select className="input" aria-label="Avaliador" value={filtros.evaluator} onChange={(e) => mudar({ evaluator: e.target.value })}>
              <option value="">Qualquer gestor</option>
              {avaliadores.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-spot-gray-600 min-h-10">
              <input type="checkbox" checked={filtros.multipleEvaluators} onChange={(e) => mudar({ multipleEvaluators: e.target.checked })} />
              Dois gestores avaliaram
            </label>
          </Grupo>
          <Grupo titulo="Motivo do desligamento">
            <select
              className="input"
              aria-label="Motivo do desligamento"
              value={umaOpcao(filtros.terminationReasons)}
              onChange={(e) => mudar({ terminationReasons: e.target.value ? [e.target.value as TerminationReason] : [] })}
            >
              <option value="">Qualquer</option>
              {TERMINATION_REASONS.map((m) => <option key={m} value={m}>{TERMINATION_LABELS[m]}</option>)}
              {filtros.terminationReasons.length > 1 && <option value="VARIOS" disabled>Vários</option>}
            </select>
          </Grupo>
        </div>
      )}

      {/* Resumo do recorte: quatro números, sempre do que está filtrado. */}
      <section aria-label="Resumo da consulta" className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 border-y border-spot-gray-200 py-4">
        {[
          ['Na consulta', String(resumo.total)],
          ['Em experiência', String(resumo.bySituation.AGUARDANDO_1 + resumo.bySituation.AGUARDANDO_2)],
          ['Avaliações atrasadas', String(resumo.overdue)],
          ['Taxa de efetivação', resumo.hireRate === null ? '—' : `${Math.round(resumo.hireRate * 100)}%`],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-spot-gray-500 truncate">{k}</p>
            <p className="font-mono text-2xl font-medium tabular-nums">{v}</p>
          </div>
        ))}
        {resumo.delivered > 0 && (
          <p className="col-span-full text-xs text-spot-gray-500">
            {resumo.deliveredOnTime} de {resumo.delivered} avaliações entregues no prazo ({pct(resumo.deliveredOnTime, resumo.delivered)}).
          </p>
        )}
      </section>

      {linhas.length === 0 ? (
        <p className="py-10 text-center text-spot-gray-500">
          Ninguém com esses filtros.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => aplicar(EMPTY_FILTERS)}>Limpar filtros</button>
        </p>
      ) : (
        <>
          {/* Computador: o quadro, com as colunas da planilha. */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <caption className="sr-only">Funcionários em experiência, {linhas.length} na consulta</caption>
              <thead>
                <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200 font-mono text-[11px] uppercase tracking-[0.08em]">
                  <Cab k="nome" {...cab}>Funcionário</Cab>
                  <Cab k="loja" {...cab}>Loja · setor</Cab>
                  <Cab k="admissao" {...cab}>Admissão</Cab>
                  <Cab k="prazo" {...cab}>1º período</Cab>
                  <th scope="col" className="py-2 pr-3 font-normal">2º período</th>
                  <Cab k="classificacao" {...cab}>Classif.</Cab>
                  <th scope="col" className="py-2 pr-3 font-normal">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, limite).map((r) => (
                  <tr key={r.id} className="border-b border-spot-gray-100 align-top hover:bg-spot-white transition-colors">
                    <td className="py-2.5 pr-3">
                      <Link href={`/admin/employees/${r.id}`} className="font-semibold hover:underline underline-offset-4 decoration-spot-yellow decoration-2">
                        {r.fullName}
                      </Link>
                      <p className="text-xs text-spot-gray-500">{r.role} · {r.shift === 'NOITE' ? 'noite' : 'dia'}</p>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{r.unit}<p className="text-xs text-spot-gray-500">{r.sector}</p></td>
                    <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{formatDate(r.admission)}</td>
                    <td className="py-2.5 pr-3"><CelulaPeriodo c={r.period1} /></td>
                    <td className="py-2.5 pr-3"><CelulaPeriodo c={r.period2} /></td>
                    <td className="py-2.5 pr-3">
                      {r.lastClassification ? (
                        <span title={CLASSIFICATION_LABELS[r.lastClassification]} className="tabular-nums">
                          {CLASSIFICATION_SCORE[r.lastClassification]}
                          <span className="text-xs text-spot-gray-500"> · {r.lastConclusion ? CONCLUSION_LABELS[r.lastConclusion] : ''}</span>
                        </span>
                      ) : <span className="text-spot-gray-400">—</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Situacao r={r} />
                      {r.terminationReason && (
                        <p className="text-xs text-spot-gray-500">
                          {TERMINATION_LABELS[r.terminationReason]}{r.terminationDate ? ` · ${formatDate(r.terminationDate)}` : ''}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: um bloco por pessoa, com os mesmos dados. */}
          <div className="md:hidden [&>*:last-child]:border-b-0">
            {linhas.slice(0, limite).map((r) => (
              <Link key={r.id} href={`/admin/employees/${r.id}`} className="block py-4 border-b border-spot-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.fullName}</p>
                    <p className="text-xs text-spot-gray-500">{r.role} · {r.sector} · {r.unit} · {r.shift === 'NOITE' ? 'noite' : 'dia'}</p>
                    <p className="text-xs text-spot-gray-500">Admissão {formatDate(r.admission)}</p>
                  </div>
                  <span className="text-xs shrink-0"><Situacao r={r} /></span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
                  <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-spot-gray-500">1º período</p><CelulaPeriodo c={r.period1} /></div>
                  <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-spot-gray-500">2º período</p><CelulaPeriodo c={r.period2} /></div>
                </div>
                {(r.lastClassification || r.terminationReason) && (
                  <p className="text-xs text-spot-gray-500 mt-2">
                    {r.lastClassification && `Classificação ${CLASSIFICATION_SCORE[r.lastClassification]} · ${CLASSIFICATION_LABELS[r.lastClassification]}`}
                    {r.lastClassification && r.terminationReason && ' — '}
                    {r.terminationReason && `${TERMINATION_LABELS[r.terminationReason]}${r.terminationDate ? ` em ${formatDate(r.terminationDate)}` : ''}`}
                  </p>
                )}
              </Link>
            ))}
          </div>

          {linhas.length > limite && (
            <button type="button" className="btn-ghost self-center py-2 px-5" onClick={() => setLimite((l) => l + PAGINA)}>
              Mostrar mais {Math.min(PAGINA, linhas.length - limite)} de {linhas.length - limite}
            </button>
          )}
        </>
      )}
    </div>
  );
}
