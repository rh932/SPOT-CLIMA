'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, AsyncSection, EmptyState, SkeletonCardList, useConfirm, useToast } from '@/components/async';
import { useMyPermissions } from '../../useMyPermissions';

interface TrainingRecord {
  id: string;
  trainingDate: string;
  result: string;
  needsReinforcement: boolean;
  reinforcementNotes: string | null;
  observations: string | null;
  employeeFeedback: string | null;
  closure: 'DIA' | 'DEFINITIVO';
  reopenedAt: string | null;
  employee: { id: string; fullName: string; roleDescription: string } | null;
  trainingType: { id: string; name: string } | null;
  trainer: { id: string; name: string } | null;
  reopenedBy: { id: string; name: string } | null;
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

export default function HistoricoTreinamentosPage() {
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reabrindoId, setReabrindoId] = useState<string | null>(null);
  const { can } = useMyPermissions();
  const { mostrar } = useToast();
  const confirmar = useConfirm();
  // Mesma regra da rota: quem pode reabrir um encerramento é quem supervisiona.
  const supervisiona = can('trainings.reopen');

  const load = () => apiFetch<{ trainings: TrainingRecord[] }>('/api/gestor/trainings').then((d) => setTrainings(d.trainings));

  const carregar = useCallback(() => {
    setLoading(true);
    setError(null);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar o histórico.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  /** Só quem acompanha (Gestor Líder) reabre — nunca quem registrou a ficha. */
  const reabrir = async (t: TrainingRecord) => {
    if (!(await confirmar({
      titulo: `Reabrir o treinamento "${t.trainingType?.name ?? ''}" de ${t.employee?.fullName ?? 'este colaborador'}?`,
      texto: 'O tipo volta a aceitar novas fichas e a reabertura fica registrada.',
      acao: 'Reabrir treinamento',
    }))) return;
    setError(null);
    setReabrindoId(t.id);
    try {
      await apiFetch(`/api/gestor/trainings/${t.id}/reopen`, { method: 'POST' });
      mostrar(`Treinamento de ${t.employee?.fullName ?? 'colaborador'} reaberto.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível reabrir o treinamento.');
    } finally {
      setReabrindoId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* Quem supervisiona (Gestor Líder, Super Admin) vê os treinamentos da
            equipe; quem treina vê os próprios. O título precisa dizer qual dos
            dois é, senão uma lista vazia parece defeito. */}
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">
          {supervisiona ? 'Treinamentos da equipe' : 'Meus treinamentos'}
        </h1>
        <p className="text-spot-gray-500 text-sm">
          {supervisiona
            ? 'Treinamentos registrados na sua operação, do mais recente ao mais antigo.'
            : 'Treinamentos que você registrou, do mais recente ao mais antigo.'}
        </p>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={carregar}
        rotulo="o histórico de treinamentos"
        skeleton={<SkeletonCardList rows={4} />}
        empty={trainings.length === 0}
        emptyState={<EmptyState>Você ainda não registrou nenhum treinamento.</EmptyState>}
      >
        <div className="flex flex-col gap-2">
          {trainings.map((t, i) => {
            const open = openId === t.id;
            const temDetalhe = t.reinforcementNotes || t.observations || t.employeeFeedback;
            return (
              <div
                key={t.id}
                className="card flex flex-col gap-2 animate-fadeIn"
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t.employee?.fullName ?? 'Colaborador removido'}</p>
                    <p className="text-xs text-spot-gray-500">
                      {t.trainingType?.name} · {new Date(t.trainingDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      {' · '}treinado por {t.trainer?.name ?? '—'}
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
                  {temDetalhe && (
                    <button
                      type="button"
                      className="btn-ghost text-xs py-1.5 px-3"
                      onClick={() => setOpenId(open ? null : t.id)}
                    >
                      {open ? 'Ocultar detalhes' : 'Ver detalhes'}
                    </button>
                  )}
                  {t.closure === 'DEFINITIVO' && can('trainings.reopen') && (
                    <ActionButton
                      type="button"
                      className="btn-ghost text-xs py-1.5 px-3"
                      onClick={() => reabrir(t)}
                      pending={reabrindoId === t.id}
                      pendingLabel="Reabrindo..."
                    >
                      Reabrir
                    </ActionButton>
                  )}
                </div>
                {temDetalhe && (
                  <>
                    {open && (
                      <div className="flex flex-col gap-3 border-t border-spot-gray-100 pt-3 text-sm animate-fadeIn">
                        {t.reinforcementNotes && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-0.5">Reforço</p>
                            <p>{t.reinforcementNotes}</p>
                          </div>
                        )}
                        {t.observations && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-0.5">Observações</p>
                            <p>{t.observations}</p>
                          </div>
                        )}
                        {t.employeeFeedback && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-0.5">
                              Sugestão / crítica do colaborador
                            </p>
                            <p>{t.employeeFeedback}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </AsyncSection>
    </div>
  );
}
