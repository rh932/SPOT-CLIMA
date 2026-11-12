'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { trainingResultLabel } from '@/lib/trainingResult';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, AsyncSection, EmptyState, SkeletonCardList, useConfirm, useToast, ehSemAcesso } from '@/components/async';
import { useMyPermissions } from '../../useMyPermissions';
import { ARQUIVO_APOS_MESES, normalizaTexto } from '@/lib/gestorEquipe';

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

interface Filtros { busca: string; tipo: string; soReforco: boolean }
const FILTROS_INICIAIS: Filtros = { busca: '', tipo: '', soReforco: false };

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

function passa(t: TrainingRecord, f: Filtros): boolean {
  const q = normalizaTexto(f.busca.trim());
  return (!q || normalizaTexto(t.employee?.fullName ?? '').includes(q))
    && (!f.tipo || t.trainingType?.id === f.tipo)
    && (!f.soReforco || t.needsReinforcement);
}

export default function HistoricoTreinamentosPage() {
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [arquivo, setArquivo] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reabrindoId, setReabrindoId] = useState<string | null>(null);
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [apagandoArquivo, setApagandoArquivo] = useState(false);
  const [arquivoAberto, setArquivoAberto] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const { can } = useMyPermissions();
  const { mostrar } = useToast();
  const confirmar = useConfirm();
  // Mesma regra da rota: quem pode reabrir um encerramento é quem supervisiona.
  // Apagar do arquivo segue a mesma regra.
  const supervisiona = can('trainings.reopen');

  const load = () => apiFetch<{ trainings: TrainingRecord[]; arquivo: TrainingRecord[] }>('/api/gestor/trainings')
    .then((d) => { setTrainings(d.trainings); setArquivo(d.arquivo); });

  const carregar = useCallback(() => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    load()
      .catch((e) => { setForbidden(ehSemAcesso(e)); setError(e instanceof Error ? e.message : 'Erro ao carregar o histórico.'); })
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

  /** Apaga um treinamento do arquivo. A rota recusa o que não for antigo. */
  const apagar = async (t: TrainingRecord) => {
    const nome = t.employee?.fullName ?? 'este colaborador';
    if (!(await confirmar({
      titulo: `Apagar o treinamento "${t.trainingType?.name ?? ''}" de ${nome}?`,
      texto: t.closure === 'DEFINITIVO'
        ? 'Some de vez, com as respostas. Como era um encerramento definitivo, o colaborador volta a poder ser treinado nesse tipo. Não dá para desfazer.'
        : 'Some de vez, com as respostas. Não dá para desfazer.',
      acao: 'Apagar treinamento',
    }))) return;
    setError(null);
    setApagandoId(t.id);
    try {
      await apiFetch(`/api/gestor/trainings/${t.id}`, { method: 'DELETE' });
      mostrar(`Treinamento de ${nome} apagado.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível apagar o treinamento.');
    } finally {
      setApagandoId(null);
    }
  };

  /** Esvazia o arquivo inteiro do escopo. Só aparece sem filtro, para não apagar além do que se vê. */
  const apagarArquivo = async () => {
    const total = arquivo.length;
    if (!(await confirmar({
      titulo: `Apagar os ${total} treinamentos do arquivo?`,
      texto: `Todos os treinamentos com mais de ${ARQUIVO_APOS_MESES} meses da sua equipe somem de vez, com as respostas. Encerramentos definitivos voltam a permitir novo treinamento. Não dá para desfazer.`,
      acao: 'Apagar arquivo',
    }))) return;
    setError(null);
    setApagandoArquivo(true);
    try {
      const r = await apiFetch<{ deleted: number }>('/api/gestor/trainings/arquivo', { method: 'DELETE' });
      mostrar(`${r.deleted} ${r.deleted === 1 ? 'treinamento apagado' : 'treinamentos apagados'} do arquivo.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível apagar o arquivo.');
    } finally {
      setApagandoArquivo(false);
    }
  };

  const tipos = useMemo(() => {
    const mapa = new Map<string, string>();
    [...trainings, ...arquivo].forEach((t) => { if (t.trainingType) mapa.set(t.trainingType.id, t.trainingType.name); });
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [trainings, arquivo]);

  const recentes = trainings.filter((t) => passa(t, filtros));
  const arquivados = arquivo.filter((t) => passa(t, filtros));
  const filtrado = filtros.busca.trim() !== '' || filtros.tipo !== '' || filtros.soReforco;
  const nenhum = trainings.length === 0 && arquivo.length === 0;

  const renderCartao = (t: TrainingRecord, i: number, noArquivo: boolean) => (
    <CartaoTreinamento
      key={t.id}
      t={t}
      indice={i}
      aberto={openId === t.id}
      onAbrir={() => setOpenId(openId === t.id ? null : t.id)}
      podeReabrir={t.closure === 'DEFINITIVO' && can('trainings.reopen')}
      reabrindo={reabrindoId === t.id}
      onReabrir={() => reabrir(t)}
      podeApagar={noArquivo && supervisiona}
      apagando={apagandoId === t.id}
      onApagar={() => apagar(t)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* Quem supervisiona (Gestor Líder, Super Admin) vê os treinamentos da
            equipe; quem treina vê os próprios. O título precisa dizer qual dos
            dois é, senão uma lista vazia parece defeito. */}
        <h1 className="titulo-pagina">
          {supervisiona ? 'Treinamentos da equipe' : 'Meus treinamentos'}
        </h1>
        <p className="text-spot-gray-500 text-sm">
          {supervisiona
            ? `Treinamentos da sua operação, do mais recente ao mais antigo. Os com mais de ${ARQUIVO_APOS_MESES} meses vão para o arquivo, no fim da página.`
            : `Treinamentos que você registrou, do mais recente ao mais antigo. Os com mais de ${ARQUIVO_APOS_MESES} meses vão para o arquivo.`}
        </p>
      </div>

      {!nenhum && !loading && !error && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[12rem]">
            <span className="sr-only">Buscar colaborador nos treinamentos</span>
            <input
              type="search"
              className="input"
              placeholder="Buscar colaborador..."
              value={filtros.busca}
              onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            />
          </label>
          {tipos.length > 1 && (
            <label className="block min-w-0">
              <span className="sr-only">Tipo de treinamento</span>
              <select
                className="input !w-auto text-sm"
                value={filtros.tipo}
                onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
              >
                <option value="">Todos os tipos</option>
                {tipos.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm min-h-11">
            <input
              type="checkbox"
              checked={filtros.soReforco}
              onChange={(e) => setFiltros((f) => ({ ...f, soReforco: e.target.checked }))}
            />
            Só quem precisa de reforço
          </label>
        </div>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={carregar}
        rotulo="o histórico de treinamentos"
        skeleton={<SkeletonCardList rows={4} />}
        empty={recentes.length === 0}
        emptyState={
          <EmptyState>
            {nenhum
              ? 'Você ainda não registrou nenhum treinamento.'
              : filtrado
                ? 'Nenhum treinamento recente para este filtro.'
                : `Nenhum treinamento nos últimos ${ARQUIVO_APOS_MESES} meses.`}
          </EmptyState>
        }
      >
        <div className="flex flex-col gap-2">
          {recentes.map((t, i) => renderCartao(t, i, false))}
        </div>
      </AsyncSection>

      {/* Arquivo: o que passou de ARQUIVO_APOS_MESES meses. Fica fechado para a
          lista de hoje caber na tela; a exclusão só existe aqui dentro. */}
      {!loading && !error && arquivo.length > 0 && (
        <section aria-labelledby="arquivo-treinos" className="border-t-2 border-spot-gray-300 pt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="arquivo-treinos" className="font-sans text-xl font-extrabold tracking-tight leading-tight text-spot-gray-800">
                Arquivo <span className="text-spot-gray-500 font-normal">({arquivo.length})</span>
              </h2>
              <p className="text-sm text-spot-gray-500">Treinamentos com mais de {ARQUIVO_APOS_MESES} meses.</p>
            </div>
            <button
              type="button"
              className="btn-ghost py-2 px-4"
              aria-expanded={arquivoAberto}
              aria-controls="lista-arquivo-treinos"
              onClick={() => setArquivoAberto((v) => !v)}
            >
              {arquivoAberto ? 'Recolher' : 'Mostrar arquivo'}
            </button>
          </div>

          {arquivoAberto && (
            <div id="lista-arquivo-treinos" className="flex flex-col gap-4">
              {supervisiona && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-spot-white border-l-[3px] border-spot-gray-400 px-4 py-3">
                  <p className="text-xs text-spot-gray-600">
                    Apagar é definitivo. Use se o registro não precisa mais ficar guardado.
                  </p>
                  {!filtrado && (
                    <ActionButton
                      type="button"
                      className="btn-ghost text-xs py-1.5 px-3"
                      pending={apagandoArquivo}
                      pendingLabel="Apagando..."
                      onClick={apagarArquivo}
                    >
                      Apagar todo o arquivo ({arquivo.length})
                    </ActionButton>
                  )}
                </div>
              )}

              {arquivados.length === 0
                ? <EmptyState>Nenhum treinamento do arquivo para este filtro.</EmptyState>
                : <div className="flex flex-col gap-2">{arquivados.map((t, i) => renderCartao(t, i, true))}</div>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function CartaoTreinamento({
  t, indice, aberto, onAbrir, podeReabrir, reabrindo, onReabrir, podeApagar, apagando, onApagar,
}: {
  t: TrainingRecord;
  indice: number;
  aberto: boolean;
  onAbrir: () => void;
  podeReabrir: boolean;
  reabrindo: boolean;
  onReabrir: () => void;
  podeApagar: boolean;
  apagando: boolean;
  onApagar: () => void;
}) {
  const temDetalhe = t.reinforcementNotes || t.observations || t.employeeFeedback;
  return (
    <div className="card flex flex-col gap-2 animate-fadeIn" style={{ animationDelay: `${Math.min(indice, 8) * 45}ms` }}>
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
            {trainingResultLabel(t.result, t.closure)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {temDetalhe && (
          <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={onAbrir}>
            {aberto ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
        )}
        {podeReabrir && (
          <ActionButton type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={onReabrir} pending={reabrindo} pendingLabel="Reabrindo...">
            Reabrir
          </ActionButton>
        )}
        {podeApagar && (
          <ActionButton type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={onApagar} pending={apagando} pendingLabel="Apagando...">
            Apagar
          </ActionButton>
        )}
      </div>

      {temDetalhe && aberto && (
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
    </div>
  );
}
