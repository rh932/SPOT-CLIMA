'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { ErrorState, LiveStatus, RefreshingBar, SkeletonStats, SkeletonTable } from '@/components/async';
import type { TrainingReport } from '@/lib/trainingReport';

interface TrainingType { id: string; name: string }

/** Barra proporcional da média (1 a 4) de um critério. */
function ScoreBar({ average }: { average: number | null }) {
  if (average === null) {
    return <span className="text-xs text-spot-gray-500">sem nota</span>;
  }
  const pct = ((average - 1) / 3) * 100;
  // Mesma escala do mapa de calor, para a barra falar a cor do resto do sistema.
  const cor = average < 2 ? 'bg-spot-danger' : average < 3 ? 'bg-spot-warning' : 'bg-spot-success';
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="h-1.5 w-24 bg-spot-gray-200 overflow-hidden shrink-0">
        <span className={`block h-full ${cor}`} style={{ width: `${Math.max(4, pct)}%` }} />
      </span>
      <span className="text-sm font-semibold tabular-nums">{average.toFixed(2)}</span>
    </span>
  );
}

/** Indicador da régua — ver ReguaIndicadores em src/components/ui/Secao. */
function Card({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="stat">
      <p className="stat-rotulo">{label}</p>
      <p className={`stat-valor ${tone}`}>{value}</p>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-3">
      <div>
        <p className="font-semibold">{title}</p>
        {hint && <p className="text-xs text-spot-gray-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function TrainingReportPage() {
  const [report, setReport] = useState<TrainingReport | null>(null);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refiltrando, setRefiltrando] = useState(false);
  const [tiposFalharam, setTiposFalharam] = useState(false);

  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (typeId) p.set('typeId', typeId);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p;
  }, [typeId, from, to]);

  /**
   * `refiltrando` separa a PRIMEIRA carga (tela vazia → esqueleto) de uma troca
   * de filtro (números antigos continuam na tela + faixa "Atualizando").
   * Trocar tudo por esqueleto a cada tecla de data fazia a página piscar.
   */
  const primeiraCarga = useRef(true);
  const load = useCallback(() => {
    if (primeiraCarga.current) setLoading(true); else setRefiltrando(true);
    setError(null);
    apiFetch<{ report: TrainingReport }>(`/api/admin/trainings/report?${params().toString()}`)
      .then((d) => setReport(d.report))
      .catch((e) => {
        setReport(null);
        setError(e instanceof Error ? e.message : 'Erro ao carregar o relatório.');
      })
      .finally(() => {
        primeiraCarga.current = false;
        setLoading(false);
        setRefiltrando(false);
      });
  }, [params]);

  useEffect(() => {
    apiFetch<{ trainingTypes: TrainingType[] }>('/api/admin/training-types')
      .then((d) => setTypes(d.trainingTypes))
      // O filtro por tipo é opcional: se a lista não vier, o relatório inteiro
      // continua utilizável com "Todos". Só o select precisa dizer o que houve.
      .catch(() => setTiposFalharam(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportar = () => {
    const p = params();
    p.set('format', 'csv');
    window.location.href = `/api/admin/trainings/report?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Relatório de treinamentos</h1>
          <p className="text-spot-gray-500 text-sm">Onde a operação está indo bem e onde precisa de reforço.</p>
        </div>
        <Link href="/admin/trainings" className="btn-ghost text-sm py-2 px-4">Ver registros</Link>
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="block">
            <span className="label">Tipo</span>
            <select className="input !w-auto" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{tiposFalharam ? 'Todos (lista indisponível)' : 'Todos'}</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">De</span>
            <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Até</span>
            <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <button className="btn-ghost" onClick={() => { setTypeId(''); setFrom(''); setTo(''); }}>Limpar</button>
        <button className="btn-primary ml-auto" onClick={exportar} disabled={!report || report.total === 0}>
          Exportar CSV
        </button>
      </div>

      <RefreshingBar visible={refiltrando} texto="Aplicando o filtro..." />

      {/* Erro ANTES de vazio: antes a falha e o "nenhum treinamento para este
          filtro" apareciam JUNTOS, e a segunda frase desmentia a primeira. */}
      {error ? (
        <ErrorState message={error} onRetry={load} retrying={refiltrando} />
      ) : loading ? (
        <div aria-busy="true" className="flex flex-col gap-6">
          <LiveStatus>Carregando o relatório...</LiveStatus>
          <SkeletonStats cards={4} />
          <SkeletonTable rows={5} cols={4} />
        </div>
      ) : !report || report.total === 0 ? (
        <div className="card text-center py-12 text-spot-gray-500 text-sm">
          Nenhum treinamento registrado para este filtro.
        </div>
      ) : (
        <>
          <div className="stat-regua">
            <Card label="Treinamentos" value={report.total} />
            <Card label="Aprovados" value={report.approved} tone="text-spot-success" />
            <Card label="Com ressalva" value={report.approvedWithNote} tone={report.approvedWithNote ? 'text-spot-gray-900' : ''} />
            <Card label="Precisam de reforço" value={report.reinforcement} tone={report.reinforcement ? 'text-spot-danger' : ''} />
          </div>

          <Section
            title="Itens mais fracos"
            hint='Média de 1 (Ruim) a 4 (Ótimo). As respostas "Não" do formulário do bar entram na contagem, mas ficam fora da média.'
          >
            <div className="flex flex-col gap-2">
              {report.weakestCriteria.map((c) => (
                <div key={c.criterionId} className="flex items-center justify-between gap-3 border-b border-spot-gray-100 pb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.label}</p>
                    <p className="text-xs text-spot-gray-500">
                      {c.answered} avaliaç{c.answered === 1 ? 'ão' : 'ões'}
                      {c.ruimCount > 0 && ` · ${c.ruimCount} "Ruim"`}
                      {c.naoCount > 0 && ` · ${c.naoCount} "Não"`}
                    </p>
                  </div>
                  <ScoreBar average={c.average} />
                </div>
              ))}
            </div>
          </Section>

          {report.employeesNeedingReinforcement.length > 0 && (
            <Section title="Quem acumula reforço" hint="Colaboradores com treinamento marcado para reforço.">
              <div className="flex flex-col gap-1.5">
                {report.employeesNeedingReinforcement.map((e) => (
                  <div key={e.employeeId} className="flex items-center justify-between gap-3 text-sm border-b border-spot-gray-100 pb-1.5">
                    <span className="truncate">{e.fullName}</span>
                    <span className="badge badge-attention shrink-0">
                      {e.count}{e.count === 1 ? ' reforço' : ' reforços'}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Por tipo de treinamento">
              <div className="flex flex-col gap-1.5 text-sm">
                {report.byType.map((t) => (
                  <div key={t.typeId} className="flex items-center justify-between gap-3 border-b border-spot-gray-100 pb-1.5">
                    <span className="truncate">{t.name}</span>
                    <span className="text-spot-gray-500 shrink-0 text-xs">
                      {t.total} total · {t.approved} aprovados
                      {t.reinforcement > 0 && ` · ${t.reinforcement} reforço`}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Por treinador">
              <div className="flex flex-col gap-1.5 text-sm">
                {report.byTrainer.map((t) => (
                  <div key={t.trainerId} className="flex items-center justify-between gap-3 border-b border-spot-gray-100 pb-1.5">
                    <span className="truncate">{t.name}</span>
                    <span className="text-spot-gray-500 shrink-0 text-xs">
                      {t.total} treinamento{t.total === 1 ? '' : 's'}
                      {t.reinforcement > 0 && ` · ${t.reinforcement} com reforço`}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
