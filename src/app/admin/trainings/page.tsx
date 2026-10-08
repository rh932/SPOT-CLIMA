'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, AsyncSection, EmptyState, RefreshingBar, Skeleton, SkeletonCardList, useConfirm, useToast } from '@/components/async';
import { TRAINING_RATING_LABEL, type TrainingRating } from '@/data/trainingBank';

interface Criterion { id: string; label: string; hint: string | null; order: number }
interface Answer { id: string; rating: TrainingRating; criterion: Criterion | null }
interface TrainingRow {
  id: string;
  trainingDate: string;
  result: string;
  needsReinforcement: boolean;
  reinforcementNotes: string | null;
  positivePoints: string | null;
  negativePoints: string | null;
  observations: string | null;
  employeeFeedback: string | null;
  contextValues: Record<string, string> | null;
  employee: {
    id: string; fullName: string; roleDescription: string; shift: 'DIA' | 'NOITE';
    sector: { name: string } | null; unit: { name: string } | null;
  } | null;
  trainingType: { id: string; name: string; positiveLabel: string | null; negativeLabel: string | null } | null;
  trainer: { id: string; name: string } | null;
  closure: 'DIA' | 'DEFINITIVO';
  reopenedAt: string | null;
  reopenedBy: { id: string; name: string } | null;
  answers: Answer[];
}

const RESULT_LABEL: Record<string, string> = {
  APROVADO: 'Aprovado',
  APROVADO_COM_RESSALVA: 'Aprovado com ressalva',
  REPROVADO: 'Reprovado',
};
/*
 * Reaproveita as cinco classes da escala do sistema (`.badge-*` em
 * globals.css): rótulo escrito + ponto na cor, sem fundo pastel. É a mesma
 * escala do mapa de calor e da classificação de clima — o sistema inteiro
 * passa a ter UMA família de cores, em vez de uma por tela.
 */
const RESULT_BADGE: Record<string, string> = {
  APROVADO: 'badge-excellent',
  APROVADO_COM_RESSALVA: 'badge-attention',
  REPROVADO: 'badge-very-critical',
};
const SHIFT_LABEL: Record<'DIA' | 'NOITE', string> = { DIA: 'Diurno', NOITE: 'Noturno' };

export default function AdminTrainingsPage() {
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [onlyReinforcement, setOnlyReinforcement] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reabrindoId, setReabrindoId] = useState<string | null>(null);

  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const load = useCallback(
    () => apiFetch<{ trainings: TrainingRow[] }>('/api/admin/trainings').then((d) => setTrainings(d.trainings)),
    [],
  );

  const carregar = useCallback(() => {
    setLoading(true);
    setError(null);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar os treinamentos.'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { carregar(); }, [carregar]);

  /**
   * Desfaz um encerramento definitivo: o tipo volta a aceitar fichas novas
   * para aquele colaborador. A ficha em si não é alterada — fica o registro de
   * quem reabriu e quando.
   */
  const reabrir = async (t: TrainingRow) => {
    if (!(await confirmar({
      titulo: `Reabrir o treinamento "${t.trainingType?.name ?? ''}" de ${t.employee?.fullName ?? 'este colaborador'}?`,
      texto: 'O treinador poderá registrar novas fichas deste tipo e a reabertura fica registrada.',
      acao: 'Reabrir treinamento',
    }))) return;
    setError(null);
    setReabrindoId(t.id);
    try {
      await apiFetch(`/api/admin/trainings/${t.id}/reopen`, { method: 'POST' });
      mostrar(`Treinamento de ${t.employee?.fullName ?? 'colaborador'} reaberto.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível reabrir o treinamento.');
    } finally {
      setReabrindoId(null);
    }
  };

  const types = useMemo(() => {
    const map = new Map<string, string>();
    trainings.forEach((t) => { if (t.trainingType) map.set(t.trainingType.id, t.trainingType.name); });
    return [...map.entries()];
  }, [trainings]);

  const filtered = trainings.filter((t) =>
    (!typeFilter || t.trainingType?.id === typeFilter)
    && (!onlyReinforcement || t.needsReinforcement));

  const stats = {
    total: trainings.length,
    reforco: trainings.filter((t) => t.needsReinforcement).length,
    reprovados: trainings.filter((t) => t.result === 'REPROVADO').length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Treinamentos</h1>
        <p className="text-spot-gray-500 text-sm">Acompanhamento dos treinamentos registrados pelos treinadores.</p>
      </div>

      {/* Números só aparecem quando existem: "Registrados 0" durante a carga
          afirma algo que ainda não se sabe. */}
      {loading ? (
        <div aria-hidden className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="stat flex flex-col gap-2">
              <Skeleton className="h-2.5 w-2/3" />
              <Skeleton className="h-9 w-1/3" />
            </div>
          ))}
        </div>
      ) : !error && (
        <div className="stat-regua">
          {[
            ['Registrados', stats.total, ''],
            ['Com reforço', stats.reforco, stats.reforco > 0 ? 'text-spot-gray-900' : ''],
            ['Reprovados', stats.reprovados, stats.reprovados > 0 ? 'text-spot-danger' : ''],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="stat">
              <p className="stat-rotulo">{label as string}</p>
              <p className={`stat-valor ${cls as string}`}>{value as number}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select className="input !w-auto text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Todos os tipos</option>
          {types.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyReinforcement} onChange={(e) => setOnlyReinforcement(e.target.checked)} />
          Só quem precisa de reforço
        </label>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={carregar}
        rotulo="os treinamentos"
        skeleton={<SkeletonCardList rows={4} />}
        empty={filtered.length === 0}
        emptyState={
          <EmptyState>
            {trainings.length === 0 ? 'Nenhum treinamento registrado ainda.' : 'Nenhum treinamento para este filtro.'}
          </EmptyState>
        }
      >
        <div className="flex flex-col gap-2">
          {filtered.map((t, i) => {
            const open = openId === t.id;
            const answers = [...t.answers].sort((a, b) => (a.criterion?.order ?? 0) - (b.criterion?.order ?? 0));
            return (
              <div
                key={t.id}
                className="card flex flex-col gap-2 animate-fadeIn"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t.employee?.fullName ?? 'Colaborador removido'}</p>
                    <p className="text-xs text-spot-gray-500">
                      {t.trainingType?.name}
                      {t.employee && ` · ${t.employee.sector?.name} · ${t.employee.unit?.name} · ${SHIFT_LABEL[t.employee.shift]}`}
                    </p>
                    <p className="text-xs text-spot-gray-500 mt-0.5">
                      {new Date(t.trainingDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} · treinador: {t.trainer?.name ?? '—'}
                    </p>
                    {t.reopenedAt && (
                      <p className="text-xs text-spot-gray-500 mt-0.5">
                        Reaberto por {t.reopenedBy?.name ?? '—'} em{' '}
                        {new Date(t.reopenedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span className={`badge ${t.closure === 'DEFINITIVO' ? 'bg-spot-black text-spot-onBlack' : 'bg-spot-gray-100 text-spot-gray-600'}`}>
                      {t.closure === 'DEFINITIVO' ? 'Definitivo' : 'Treino do dia'}
                    </span>
                    {t.needsReinforcement && <span className="badge badge-attention">Reforço</span>}
                    <span className={`badge ${RESULT_BADGE[t.result] ?? 'bg-spot-gray-100 text-spot-gray-600'}`}>
                      {RESULT_LABEL[t.result] ?? t.result}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-xs py-1.5 px-3"
                    onClick={() => setOpenId(open ? null : t.id)}
                  >
                    {open ? 'Ocultar formulário' : 'Ver formulário completo'}
                  </button>
                  {t.closure === 'DEFINITIVO' && (
                    <ActionButton
                      type="button"
                      className="btn-ghost text-xs py-1.5 px-3"
                      onClick={() => reabrir(t)}
                      pending={reabrindoId === t.id}
                      pendingLabel="Reabrindo..."
                    >
                      Reabrir treinamento
                    </ActionButton>
                  )}
                </div>

                {open && (
                  <div className="flex flex-col gap-4 border-t border-spot-gray-100 pt-3 animate-fadeIn">
                    {t.contextValues && Object.keys(t.contextValues).length > 0 && (
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-spot-gray-600">
                        {Object.entries(t.contextValues).map(([k, v]) => (
                          <span key={k}><span className="text-spot-gray-500">{k}:</span> {v}</span>
                        ))}
                      </div>
                    )}

                    {answers.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        {answers.map((a) => (
                          <div key={a.id} className="flex justify-between gap-3 border-b border-spot-gray-100 pb-1">
                            <span className="text-spot-gray-600 min-w-0 truncate">{a.criterion?.label}</span>
                            <span className="font-semibold shrink-0">{TRAINING_RATING_LABEL[a.rating] ?? a.rating}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      {t.positivePoints && (
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-0.5">
                            {t.trainingType?.positiveLabel ?? 'Pontos positivos'}
                          </p>
                          <p>{t.positivePoints}</p>
                        </div>
                      )}
                      {t.negativePoints && (
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-0.5">
                            {t.trainingType?.negativeLabel ?? 'Pontos negativos'}
                          </p>
                          <p>{t.negativePoints}</p>
                        </div>
                      )}
                    </div>

                    {t.reinforcementNotes && (
                      <div className="text-sm">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-warningInk mb-0.5">Reforço necessário</p>
                        <p>{t.reinforcementNotes}</p>
                      </div>
                    )}
                    {t.observations && (
                      <div className="text-sm">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-0.5">Observações</p>
                        <p>{t.observations}</p>
                      </div>
                    )}
                    {t.employeeFeedback && (
                      <div className="text-sm">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-0.5">
                          Sugestão / crítica do colaborador
                        </p>
                        <p>{t.employeeFeedback}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AsyncSection>
    </div>
  );
}
