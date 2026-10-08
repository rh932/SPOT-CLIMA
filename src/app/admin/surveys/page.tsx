'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiClientError } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList, Spinner,
  useAsyncData, useConfirm, useToast,
} from '@/components/async';
import { MIN_ANONYMITY_THRESHOLD, MAX_ANONYMITY_THRESHOLD } from '@/lib/anonymity';

interface Survey {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
  openDate: string | null;
  closeDate: string | null;
  eligiblePopulation: number | null;
  anonymityThreshold: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', SCHEDULED: 'Agendada', OPEN: 'Aberta', CLOSED: 'Encerrada', ARCHIVED: 'Arquivada',
};
/*
 * Só 'Aberta' carrega cor: é o único estado que muda o que o RH faz agora.
 * Rascunho, agendada, encerrada e arquivada são informação de cadastro e
 * ficam em chip neutro — cinco cores na mesma lista não hierarquizam nada.
 */
const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-spot-gray-100 text-spot-gray-700', SCHEDULED: 'bg-spot-gray-100 text-spot-gray-700',
  OPEN: 'badge-good', CLOSED: 'bg-spot-gray-800 text-spot-onBlack', ARCHIVED: 'bg-spot-gray-100 text-spot-gray-500',
};

const ACAO_FEITA: Record<string, string> = {
  publish: 'publicada',
  close: 'encerrada',
  archive: 'arquivada',
  duplicate: 'duplicada',
};

export default function SurveysPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const { data, loading, reloading, error: loadError, reload } = useAsyncData(
    (signal) => apiFetch<{ surveys: Survey[] }>('/api/admin/surveys', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar as pesquisas.' },
  );
  const surveys = data?.surveys ?? [];

  /**
   * Publicar/encerrar/arquivar/duplicar.
   *
   * Não há otimismo aqui de propósito: publicar abre a pesquisa para o
   * restaurante inteiro e encerrar corta as respostas. Mostrar o novo estado
   * antes da confirmação do servidor faria o RH acreditar que publicou quando
   * a rota pode ter recusado. O feedback é o botão ocupado + a confirmação.
   */
  const act = async (s: Survey, action: 'publish' | 'close' | 'archive' | 'duplicate') => {
    if (busyId) return;
    setBusyId(s.id);
    setError(null);
    try {
      await apiFetch(`/api/admin/surveys/${s.id}/${action}`, { method: 'POST', body: '{}' });
      mostrar(`"${s.name}" ${ACAO_FEITA[action]}.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao executar ação.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: Survey) => {
    if (!(await confirmar({ titulo: `Excluir a pesquisa "${s.name}"?`, acao: 'Excluir pesquisa', perigo: true }))) return;
    if (busyId) return;
    setBusyId(s.id);
    setError(null);
    try {
      try {
        await apiFetch(`/api/admin/surveys/${s.id}`, { method: 'DELETE' });
      } catch (e) {
        // Pesquisa com respostas: o servidor só apaga (e só para o Super
        // Admin) depois de uma segunda confirmação com o tamanho da perda.
        if (!(e instanceof ApiClientError && e.data.precisaConfirmarRespostas)) throw e;
        const respostas = Number(e.data.respostas);
        const ok = await confirmar({
          titulo: `Apagar também ${respostas} resposta(s)?`,
          texto: `"${s.name}" já tem ${respostas} resposta(s) coletada(s). Excluir a pesquisa apaga essas respostas, as notas e o resumo dos resultados — o histórico dela some dos relatórios e comparativos. Para só tirar da lista e manter os resultados, use Arquivar.`,
          acao: 'Excluir com as respostas',
          perigo: true,
        });
        if (!ok) return;
        await apiFetch(`/api/admin/surveys/${s.id}?apagarRespostas=true`, { method: 'DELETE' });
      }
      mostrar(`"${s.name}" excluída.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir pesquisa.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Pesquisas</h1>
          <p className="text-spot-gray-500 text-sm">Crie, publique, encerre e duplique ciclos de pesquisa.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Nova pesquisa
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>
      )}

      <RefreshingBar visible={reloading} texto="Atualizando as pesquisas..." />

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={reload}
        retrying={reloading}
        rotulo="as pesquisas"
        skeleton={<SkeletonCardList rows={3} />}
        empty={surveys.length === 0}
        emptyState={<EmptyState>Nenhuma pesquisa criada ainda.</EmptyState>}
      >
        <div className="[&>*:last-child]:border-b-0">
          {surveys.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-spot-gray-200">
              <div className="min-w-[200px]">
                <div className="flex items-center gap-2.5 mb-1">
                  <p className="font-display text-lg font-semibold">{s.name}</p>
                  <span className={`badge ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                </div>
                {s.description && <p className="text-sm text-spot-gray-500">{s.description}</p>}
                <p className="text-xs text-spot-gray-500 mt-1">
                  {s.openDate ? new Date(s.openDate).toLocaleDateString('pt-BR') : 'sem data'} —{' '}
                  {s.closeDate ? new Date(s.closeDate).toLocaleDateString('pt-BR') : 'sem data'} · Anonimato mín.{' '}
                  {s.anonymityThreshold} respostas
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Numa lista, "Editar perguntas"/"Duplicar"/"Excluir" se
                    repetem por pesquisa: quem navega pela lista de controles do
                    leitor de tela ouvia a mesma palavra N vezes sem saber de
                    qual ciclo era. O texto visível não muda — o nome acessível
                    passa a carregar o nome da pesquisa. */}
                {(s.status === 'DRAFT' || s.status === 'SCHEDULED') && (
                  <Link
                    href={`/admin/surveys/${s.id}/edit`}
                    className="btn-ghost text-sm py-2 px-4"
                    aria-label={`Editar as perguntas de "${s.name}"`}
                  >
                    Editar perguntas
                  </Link>
                )}
                {s.status === 'OPEN' && (
                  <Link
                    href={`/admin/surveys/${s.id}/edit#codigos`}
                    className="btn-ghost text-sm py-2 px-4"
                    aria-label={`Códigos de participação de "${s.name}"`}
                  >
                    Códigos de participação
                  </Link>
                )}
                {(s.status === 'DRAFT' || s.status === 'SCHEDULED') && (
                  <ActionButton
                    className="btn-primary text-sm py-2 px-4"
                    pending={busyId === s.id}
                    pendingLabel="Publicando..."
                    onClick={() => act(s, 'publish')}
                    aria-label={`Publicar "${s.name}" — a pesquisa passa a aceitar respostas`}
                  >
                    Publicar
                  </ActionButton>
                )}
                {s.status === 'OPEN' && (
                  <Link
                    href={`/admin/results?survey=${s.id}`}
                    className="btn-ghost text-sm py-2 px-4"
                    aria-label={`Ver os resultados de "${s.name}"`}
                  >
                    Ver resultados
                  </Link>
                )}
                {s.status === 'OPEN' && (
                  <ActionButton
                    className="btn-secondary text-sm py-2 px-4"
                    pending={busyId === s.id}
                    pendingLabel="Encerrando..."
                    onClick={() => act(s, 'close')}
                    aria-label={`Encerrar "${s.name}" — deixa de aceitar novas respostas`}
                  >
                    Encerrar
                  </ActionButton>
                )}
                {s.status === 'CLOSED' && (
                  <Link
                    href={`/admin/results?survey=${s.id}`}
                    className="btn-ghost text-sm py-2 px-4"
                    aria-label={`Ver os resultados de "${s.name}"`}
                  >
                    Ver resultados
                  </Link>
                )}
                {s.status === 'CLOSED' && (
                  <ActionButton
                    className="btn-ghost text-sm py-2 px-4"
                    pending={busyId === s.id}
                    pendingLabel="Arquivando..."
                    onClick={() => act(s, 'archive')}
                    aria-label={`Arquivar "${s.name}" — sai da lista principal, os resultados continuam`}
                  >
                    Arquivar
                  </ActionButton>
                )}
                <ActionButton
                  className="btn-ghost text-sm py-2 px-4"
                  pending={busyId === s.id}
                  pendingLabel="Duplicando..."
                  onClick={() => act(s, 'duplicate')}
                  aria-label={`Duplicar "${s.name}" — cria um rascunho com as mesmas perguntas`}
                >
                  Duplicar
                </ActionButton>
                {s.status !== 'OPEN' && (
                  <ActionButton
                    className="btn-ghost text-sm py-2 px-4 text-spot-danger"
                    pending={busyId === s.id}
                    pendingLabel="Excluindo..."
                    onClick={() => remove(s)}
                    aria-label={`Excluir "${s.name}" e todas as respostas dela`}
                  >
                    Excluir
                  </ActionButton>
                )}
              </div>
            </div>
          ))}
        </div>
      </AsyncSection>

      {showCreate && (
        <CreateSurveyModal
          onClose={() => setShowCreate(false)}
          onCreated={(nome) => { mostrar(`"${nome}" criada.`); reload(); }}
        />
      )}
    </div>
  );
}

interface TemplateOption { id: string; name: string; category: { name: string } | null; }

function CreateSurveyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (nome: string) => void }) {
  const [source, setSource] = useState<'choose' | 'blank' | 'template'>('choose');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eligiblePopulation, setEligiblePopulation] = useState('');
  const [anonymityThreshold, setAnonymityThreshold] = useState('5');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [carregandoModelos, setCarregandoModelos] = useState(false);
  const painelRef = usePainelModal<HTMLDivElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  /**
   * Busca os modelos ao abrir a aba.
   *
   * Antes esta chamada não tinha estado de carga nem `catch`: numa rede lenta
   * a lista ficava vazia e parecia "nenhum modelo cadastrado", e numa falha a
   * promessa morria no console sem nada aparecer na tela.
   */
  const chooseTemplate = async () => {
    setSource('template');
    if (templates.length > 0) return;
    setCarregandoModelos(true);
    setError(null);
    try {
      const data = await apiFetch<{ templates: TemplateOption[] }>('/api/admin/templates');
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar os modelos.');
    } finally {
      setCarregandoModelos(false);
    }
  };

  const submitBlank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { survey } = await apiFetch<{ survey: { id: string } }>('/api/admin/surveys', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: description || undefined,
          eligiblePopulation: eligiblePopulation ? Number(eligiblePopulation) : undefined,
          anonymityThreshold: Number(anonymityThreshold),
        }),
      });
      setCreatedId(survey.id);
      onCreated(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar pesquisa.');
    } finally {
      setSaving(false);
    }
  };

  const submitFromTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { survey } = await apiFetch<{ survey: { id: string } }>(`/api/admin/templates/${selectedTemplateId}/create-survey`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          eligiblePopulation: eligiblePopulation ? Number(eligiblePopulation) : undefined,
          anonymityThreshold: Number(anonymityThreshold),
        }),
      });
      setCreatedId(survey.id);
      onCreated(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar pesquisa a partir do modelo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab continuava passeando pelo conteudo
          coberto atras dele, incluindo botoes destrutivos. */}
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nova pesquisa"
        className="bg-spot-white rounded-xl2 max-w-md w-full p-6 modal-panel"
      >
        {createdId ? (
          <div className="text-center">
            <p className="font-semibold mb-1">Pesquisa criada em rascunho.</p>
            <p className="text-sm text-spot-gray-500 mb-5">
              {source === 'template' ? 'As perguntas do modelo já foram copiadas.' : 'Agora adicione as perguntas antes de publicar.'}
            </p>
            <div className="flex gap-3">
              <button className="btn-ghost flex-1" onClick={onClose}>
                Fechar
              </button>
              <Link href={`/admin/surveys/${createdId}/edit`} className="btn-primary flex-1">
                Editar perguntas
              </Link>
            </div>
          </div>
        ) : source === 'choose' ? (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-semibold">Nova pesquisa</h2>
            <p className="text-sm text-spot-gray-500">Como você quer começar?</p>
            <div className="flex flex-col gap-3">
              <button className="card text-left hover:border-spot-black transition" onClick={() => setSource('blank')}>
                <p className="font-semibold">Começar do zero</p>
                <p className="text-sm text-spot-gray-500">Cria uma pesquisa vazia — você adiciona as perguntas depois.</p>
              </button>
              <button
                className="card text-left hover:border-spot-black transition disabled:opacity-60"
                onClick={chooseTemplate}
                disabled={carregandoModelos}
                aria-busy={carregandoModelos || undefined}
              >
                <p className="font-semibold flex items-center gap-2">
                  Usar um modelo
                  {carregandoModelos && <Spinner className="h-3.5 w-3.5" />}
                </p>
                <p className="text-sm text-spot-gray-500">
                  {carregandoModelos
                    ? 'Buscando os modelos da Biblioteca...'
                    : 'Escolhe um modelo pronto da Biblioteca e copia as perguntas automaticamente.'}
                </p>
              </button>
            </div>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          </div>
        ) : source === 'blank' ? (
          <form onSubmit={submitBlank} className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-semibold">Nova pesquisa — do zero</h2>
            <div>
              <label className="block">
                <span className="label">Nome</span>
                <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pesquisa de Clima - Março/2026" />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Descrição (opcional)</span>
                <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Colaboradores elegíveis</span>
                  <input type="number" min={1} className="input" value={eligiblePopulation} onChange={(e) => setEligiblePopulation(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Mín. p/ anonimato</span>
                  <input type="number" min={MIN_ANONYMITY_THRESHOLD} max={MAX_ANONYMITY_THRESHOLD} className="input" value={anonymityThreshold} onChange={(e) => setAnonymityThreshold(e.target.value)} aria-describedby="limite-anonimato-ajuda" />
                  <span id="limite-anonimato-ajuda" className="text-[11px] text-spot-gray-500">Mínimo {MIN_ANONYMITY_THRESHOLD}: abaixo disso um setor pequeno mostraria a resposta de alguém.</span>
                </label>
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-spot-danger">{error}</p>}
            <div className="flex gap-3 mt-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setSource('choose')}>
                Voltar
              </button>
              <ActionButton type="submit" className="btn-primary flex-1" pending={saving} pendingLabel="Criando...">
                Criar pesquisa
              </ActionButton>
            </div>
            <p className="text-xs text-spot-gray-500">
              A pesquisa nasce sem perguntas. Na tela seguinte você pode importar uma planilha Excel ou adicionar
              perguntas manualmente.
            </p>
          </form>
        ) : (
          <form onSubmit={submitFromTemplate} className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-semibold">Nova pesquisa — a partir de modelo</h2>
            <div>
              <label className="block">
                <span className="label">Modelo</span>
                <select
                  required
                  className="input"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={carregandoModelos || saving}
                >
                  <option value="">{carregandoModelos ? 'Carregando modelos...' : 'Selecione...'}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.category ? `${t.category.name} — ${t.name}` : t.name}</option>
                  ))}
                </select>
              </label>
              {!carregandoModelos && templates.length === 0 && !error && (
                <p className="text-xs text-spot-gray-500 mt-1">
                  Nenhum modelo na Biblioteca ainda. Volte e escolha &quot;Começar do zero&quot;.
                </p>
              )}
            </div>
            <div>
              <label className="block">
                <span className="label">Nome da pesquisa</span>
                <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pesquisa de Clima - Março/2026" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Colaboradores elegíveis</span>
                  <input type="number" min={1} className="input" value={eligiblePopulation} onChange={(e) => setEligiblePopulation(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Mín. p/ anonimato</span>
                  <input type="number" min={MIN_ANONYMITY_THRESHOLD} max={MAX_ANONYMITY_THRESHOLD} className="input" value={anonymityThreshold} onChange={(e) => setAnonymityThreshold(e.target.value)} aria-describedby="limite-anonimato-ajuda" />
                  <span id="limite-anonimato-ajuda" className="text-[11px] text-spot-gray-500">Mínimo {MIN_ANONYMITY_THRESHOLD}: abaixo disso um setor pequeno mostraria a resposta de alguém.</span>
                </label>
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-spot-danger">{error}</p>}
            <div className="flex gap-3 mt-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setSource('choose')}>
                Voltar
              </button>
              <ActionButton
                type="submit"
                className="btn-primary flex-1"
                pending={saving}
                pendingLabel="Criando..."
                disabled={!selectedTemplateId}
              >
                Criar pesquisa
              </ActionButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
