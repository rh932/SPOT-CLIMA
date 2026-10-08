'use client';

/**
 * Indicadores da Experiência — a visão consolidada da avaliação de 45/90 dias:
 * evolução mês a mês, loja e setor, e a pontualidade de cada gestor (a lista
 * de cobrança). A regra está em src/lib/indicators.ts.
 */

import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { AsyncSection, SkeletonStats, useAsyncData } from '@/components/async';
import { StatCard } from '@/components/StatCard';
import { ReguaIndicadores, Secao } from '@/components/ui/Secao';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import type { GroupIndicator, IndicatorsResult } from '@/lib/indicators';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return `${MESES[mm - 1]}/${String(y).slice(2)}`;
};
const ROLE: Record<string, string> = { GESTOR: 'Gestor', GESTOR_LIDER: 'Gestor Líder' };

export default function IndicadoresPage() {
  const { data, loading, reloading, error, reload } = useAsyncData(
    (signal) => apiFetch<IndicatorsResult>('/api/admin/indicators', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar os indicadores.' },
  );

  const maxAdmitidos = Math.max(1, ...(data?.months.map((m) => m.admitted) ?? [1]));

  return (
    <div className="flex flex-col gap-8">
      <CabecalhoPagina
        titulo="Indicadores da Experiência"
        subtitulo="Como a avaliação de 45 e 90 dias está indo: efetivação, prazos e a pontualidade de cada gestor. Últimos 12 meses, pelo mês de admissão."
        acao={<Link href="/admin/employees" className="btn-ghost">Ver a lista de colaboradores</Link>}
      />

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        retrying={reloading}
        rotulo="os indicadores"
        skeleton={<SkeletonStats />}
      >
        {data && (
          <>
            <ReguaIndicadores>
              <StatCard label="Admitidos (12 meses)" value={String(data.totals.admitted)} sub="Sem jovem aprendiz" />
              <StatCard label="Taxa de efetivação" value={pct(data.totals.hireRate)} sub="Efetivados ÷ quem já teve desfecho" />
              <StatCard label="Avaliações no prazo" value={pct(data.totals.onTimeRate)} sub="1ª resposta de cada período" />
              <StatCard label="Atrasadas agora" value={String(data.totals.overdueNow)} sub="Experiência e feedback vencidos" />
            </ReguaIndicadores>

            <Secao indice="01" titulo="Mês a mês" nota="Pelo mês de admissão. Em curso = ainda dentro dos 90 dias ou sem desfecho registrado.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200">
                      <th className="py-2 pr-3 font-medium">Mês</th>
                      <th className="py-2 pr-3 font-medium w-[40%]">Admitidos</th>
                      <th className="py-2 pr-3 font-medium text-right">Efetivados</th>
                      <th className="py-2 pr-3 font-medium text-right">Saíram na experiência</th>
                      <th className="py-2 pr-3 font-medium text-right">Em curso</th>
                      <th className="py-2 font-medium text-right">Efetivação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={m.month} className="border-b border-spot-gray-100">
                        <td className="py-2 pr-3 font-medium whitespace-nowrap">{nomeMes(m.month)}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            {/* Barra empilhada: efetivados, desligados, em curso — o comprimento total é o nº de admitidos. */}
                            <div
                              className="flex h-2.5 rounded-full overflow-hidden bg-spot-gray-100"
                              style={{ width: `${(m.admitted / maxAdmitidos) * 100}%`, minWidth: m.admitted ? '0.5rem' : 0 }}
                              aria-hidden
                            >
                              <span style={{ flex: m.hired, background: '#0f7a3d' }} />
                              <span style={{ flex: m.dismissed, background: '#d64545' }} />
                              <span style={{ flex: m.ongoing, background: '#c9c4b8' }} />
                            </div>
                            <span className="tabular-nums">{m.admitted}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{m.hired}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{m.dismissed}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{m.ongoing}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{pct(m.hireRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-spot-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Legenda cor="#0f7a3d" texto="Efetivados" />
                <Legenda cor="#d64545" texto="Saíram na experiência" />
                <Legenda cor="#c9c4b8" texto="Em curso" />
              </p>
            </Secao>

            <Secao
              indice="02"
              titulo="Gestores: pontualidade e cobrança"
              nota="Avaliações feitas nos últimos 12 meses (experiência e feedback) e prazos em aberto hoje no escopo de cada um. Primeiro quem tem atraso."
            >
              {data.managers.length === 0 ? (
                <p className="text-sm text-spot-gray-500">Nenhum gestor ativo cadastrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200">
                        <th className="py-2 pr-3 font-medium">Gestor</th>
                        <th className="py-2 pr-3 font-medium text-right">Atrasadas agora</th>
                        <th className="py-2 pr-3 font-medium text-right">Vencem em 7 dias</th>
                        <th className="py-2 pr-3 font-medium text-right">Avaliações feitas</th>
                        <th className="py-2 pr-3 font-medium text-right">No prazo</th>
                        <th className="py-2 font-medium text-right">Atraso médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.managers.map((g) => (
                        <tr key={g.id} className="border-b border-spot-gray-100">
                          <td className="py-2 pr-3">
                            <span className="font-medium">{g.name}</span>
                            <span className="block text-xs text-spot-gray-500">{ROLE[g.role] ?? g.role}</span>
                          </td>
                          <td className={`py-2 pr-3 text-right tabular-nums ${g.overdueNow > 0 ? 'font-semibold text-spot-danger' : ''}`}>
                            {g.overdueNow}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{g.dueSoon}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{g.role === 'GESTOR' ? g.evaluations : '—'}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{g.role === 'GESTOR' ? pct(g.onTimeRate) : '—'}</td>
                          <td className="py-2 text-right tabular-nums">
                            {g.avgDaysLate === null ? '—' : `${g.avgDaysLate.toLocaleString('pt-BR')} dia(s)`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-spot-gray-500 mt-2">
                O Gestor Líder não avalia (acompanha o escopo), por isso só aparece na cobrança. Para mandar o lembrete na
                hora, use &quot;Lembrar gestores agora&quot; em <Link href="/admin/employees" className="underline">Avaliação de Experiência</Link>.
              </p>
            </Secao>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Secao indice="03" titulo="Por loja">
                <TabelaGrupos grupos={data.byUnit} />
              </Secao>
              <Secao indice="04" titulo="Por setor">
                <TabelaGrupos grupos={data.bySector} />
              </Secao>
            </div>
          </>
        )}
      </AsyncSection>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cor }} />
      {texto}
    </span>
  );
}

function TabelaGrupos({ grupos }: { grupos: GroupIndicator[] }) {
  if (grupos.length === 0) return <p className="text-sm text-spot-gray-500">Sem dados.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200">
            <th className="py-2 pr-3 font-medium">Nome</th>
            <th className="py-2 pr-3 font-medium text-right">Pessoas</th>
            <th className="py-2 pr-3 font-medium text-right">Efetivação</th>
            <th className="py-2 pr-3 font-medium text-right">No prazo</th>
            <th className="py-2 font-medium text-right">Atrasadas</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.name} className="border-b border-spot-gray-100">
              <td className="py-2 pr-3 font-medium">{g.name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{g.total}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{pct(g.hireRate)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{pct(g.onTimeRate)}</td>
              <td className={`py-2 text-right tabular-nums ${g.overdueNow > 0 ? 'font-semibold text-spot-danger' : ''}`}>{g.overdueNow}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
