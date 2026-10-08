'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncAction, useAsyncData, useConfirm, useToast,
} from '@/components/async';

interface Sector {
  id: string; name: string; order: number; active: boolean; usesColorCycle: boolean;
  inSurvey: boolean; inEvaluation: boolean; inTraining: boolean;
}

/**
 * Onde o setor aparece. A Administração é o caso de "só pesquisa": nas
 * avaliações ela é dividida pela área de cada gestor (Financeiro, RH...),
 * que por sua vez são "só avaliações".
 */
type Uso = 'AMBOS' | 'PESQUISA' | 'AVALIACAO';
const USO_LABEL: Record<Uso, string> = {
  AMBOS: 'Pesquisa e avaliações',
  PESQUISA: 'Só pesquisa de clima',
  AVALIACAO: 'Só avaliações',
};
function usoDe(s: Sector): Uso {
  if (s.inSurvey && !s.inEvaluation) return 'PESQUISA';
  if (!s.inSurvey && s.inEvaluation) return 'AVALIACAO';
  return 'AMBOS';
}
function chavesDe(uso: Uso) {
  return { inSurvey: uso !== 'AVALIACAO', inEvaluation: uso !== 'PESQUISA' };
}

export default function SectorsPage() {
  const { data, loading, reloading, error, reload, setData } = useAsyncData(
    (signal) => apiFetch<{ sectors: Sector[] }>('/api/admin/sectors', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar os setores.' },
  );
  const sectors = data?.sectors ?? [];
  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const [newName, setNewName] = useState('');
  const [criando, setCriando] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (criando) return;
    setCriando(true);
    setCreateError(null);
    try {
      await apiFetch('/api/admin/sectors', { method: 'POST', body: JSON.stringify({ name: newName, order: sectors.length + 1 }) });
      setNewName('');
      await reload();
      mostrar('Setor adicionado.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar setor.');
    } finally {
      setCriando(false);
    }
  };

  /**
   * Otimista: ativar/desativar e o ciclo de cores são booleanos, então a lista
   * muda na hora e volta sozinha se a rota recusar. Antes o clique não dava
   * sinal nenhum até a recarga terminar — e, numa falha, a promessa morria no
   * console e o item continuava do jeito antigo sem nenhuma explicação.
   */
  const toggleActive = async (s: Sector) => {
    const anterior = sectors;
    setData({ sectors: sectors.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)) });
    const ok = await acao.run(async () => {
      if (s.active) await apiFetch(`/api/admin/sectors/${s.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/admin/sectors/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) });
      return true;
    }, s.id);
    if (!ok) { setData({ sectors: anterior }); return; }
    mostrar(s.active ? `"${s.name}" desativado.` : `"${s.name}" reativado.`);
    await reload();
  };

  /**
   * Liga/desliga o projeto de cores no setor. Quem está num setor com a chave
   * desligada faz 45 e 90 dias normalmente, mas efetiva sem cor e não entra no
   * ciclo de feedback nem nos avisos.
   */
  const toggleColorCycle = async (s: Sector) => {
    if (s.usesColorCycle && !(await confirmar({
      titulo: `Desligar o projeto de cores em "${s.name}"?`,
      texto: 'Os colaboradores deste setor param de receber avisos de feedback. As cores já registradas continuam no histórico.',
      acao: 'Desligar',
    }))) return;

    const anterior = sectors;
    setData({ sectors: sectors.map((x) => (x.id === s.id ? { ...x, usesColorCycle: !x.usesColorCycle } : x)) });
    const ok = await acao.run(async () => {
      await apiFetch(`/api/admin/sectors/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ usesColorCycle: !s.usesColorCycle }),
      });
      return true;
    }, `cores:${s.id}`);
    if (!ok) { setData({ sectors: anterior }); return; }
    mostrar(s.usesColorCycle ? `"${s.name}" saiu do ciclo de cores.` : `"${s.name}" entrou no ciclo de cores.`);
    await reload();
  };

  /**
   * Liga/desliga o treinamento no setor. Só colaboradores de setores com a
   * chave ligada aparecem para treinar, e só esses setores entram no escopo de
   * um treinador. Os treinamentos já registrados continuam no histórico.
   */
  const toggleTraining = async (s: Sector) => {
    if (s.inTraining && !(await confirmar({
      titulo: `Tirar "${s.name}" do treinamento?`,
      texto: 'Os colaboradores deste setor deixam de aparecer para os treinadores. Os treinamentos já registrados continuam no histórico.',
      acao: 'Tirar do treinamento',
    }))) return;

    const anterior = sectors;
    setData({ sectors: sectors.map((x) => (x.id === s.id ? { ...x, inTraining: !x.inTraining } : x)) });
    const ok = await acao.run(async () => {
      await apiFetch(`/api/admin/sectors/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ inTraining: !s.inTraining }),
      });
      return true;
    }, `treino:${s.id}`);
    if (!ok) { setData({ sectors: anterior }); return; }
    mostrar(s.inTraining ? `"${s.name}" saiu do treinamento.` : `"${s.name}" entrou no treinamento.`);
    await reload();
  };

  const changeUso = async (s: Sector, uso: Uso) => {
    if (uso === usoDe(s)) return;
    const anterior = sectors;
    const chaves = chavesDe(uso);
    setData({ sectors: sectors.map((x) => (x.id === s.id ? { ...x, ...chaves } : x)) });
    const ok = await acao.run(async () => {
      await apiFetch(`/api/admin/sectors/${s.id}`, { method: 'PATCH', body: JSON.stringify(chaves) });
      return true;
    }, `uso:${s.id}`);
    if (!ok) { setData({ sectors: anterior }); return; }
    mostrar(`"${s.name}": ${USO_LABEL[uso].toLowerCase()}.`);
    await reload();
  };

  const remove = async (s: Sector) => {
    if (!(await confirmar({ titulo: `Excluir o setor "${s.name}"?`, acao: 'Excluir setor', perigo: true }))) return;
    const ok = await acao.run(async () => {
      await apiFetch(`/api/admin/sectors/${s.id}?hard=true`, { method: 'DELETE' });
      return true;
    }, s.id);
    if (!ok) return;
    mostrar(`"${s.name}" excluído.`);
    await reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Setores</h1>
        <p className="text-spot-gray-500 text-sm">
          Um dos dois recortes usados nas pesquisas, junto com a unidade — é o que o funcionário seleciona ao responder.
        </p>
      </div>

      <RefreshingBar visible={reloading} />
      {acao.error && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">
          {acao.error}
        </p>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        retrying={reloading}
        rotulo="os setores"
        skeleton={<SkeletonCardList rows={4} comBadge={false} />}
        empty={sectors.length === 0}
        emptyState={<EmptyState>Nenhum setor cadastrado. Use o campo abaixo para criar o primeiro.</EmptyState>}
      >
        <div className="[&>*:last-child]:border-b-0">
          {[...sectors].sort((a, b) => a.order - b.order).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3.5 border-b border-spot-gray-200">
              <span className={`flex items-center gap-2 flex-wrap ${s.active ? '' : 'text-spot-gray-500 line-through'}`}>
                {s.name}
                {!s.active && <span className="badge bg-spot-gray-100 text-spot-gray-500 no-underline">Inativo</span>}
                {s.usesColorCycle && (
                  <span className="badge bg-spot-gray-100 text-spot-gray-700 no-underline">Ciclo de cores</span>
                )}
                {s.inTraining && (
                  <span className="badge bg-spot-gray-100 text-spot-gray-700 no-underline">Treinamento</span>
                )}
                {usoDe(s) !== 'AMBOS' && (
                  <span className="badge bg-spot-gray-100 text-spot-gray-700 no-underline">{USO_LABEL[usoDe(s)]}</span>
                )}
              </span>
              <div className="flex gap-2 shrink-0 flex-wrap items-center">
                <select
                  className="input w-auto sm:text-xs"
                  value={usoDe(s)}
                  disabled={acao.isPending(`uso:${s.id}`)}
                  onChange={(e) => changeUso(s, e.target.value as Uso)}
                  aria-label={`Onde o setor "${s.name}" aparece`}
                >
                  {(Object.keys(USO_LABEL) as Uso[]).map((u) => <option key={u} value={u}>{USO_LABEL[u]}</option>)}
                </select>
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3"
                  pending={acao.isPending(`cores:${s.id}`)}
                  pendingLabel="Salvando..."
                  onClick={() => toggleColorCycle(s)}
                  /* O title sozinho nao servia: nao existe hover no celular, e
                     varios leitores de tela o ignoram. Vira aria-label, e o
                     title continua so como reforco para quem usa mouse. */
                  aria-label={
                    s.usesColorCycle
                      ? `Tirar "${s.name}" do ciclo de cores — os colaboradores param de receber aviso de feedback`
                      : `Incluir "${s.name}" no ciclo de cores — feedback a cada 45, 120 ou 180 dias`
                  }
                  title="Projeto de cores: 45 / 120 / 180 dias de feedback"
                >
                  {s.usesColorCycle ? 'Tirar do ciclo de cores' : 'Incluir no ciclo de cores'}
                </ActionButton>
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3"
                  pending={acao.isPending(`treino:${s.id}`)}
                  pendingLabel="Salvando..."
                  onClick={() => toggleTraining(s)}
                  aria-label={
                    s.inTraining
                      ? `Tirar "${s.name}" do treinamento — os treinadores deixam de ver os colaboradores deste setor`
                      : `Incluir "${s.name}" no treinamento — os colaboradores passam a aparecer para os treinadores`
                  }
                >
                  {s.inTraining ? 'Tirar do treinamento' : 'Incluir no treinamento'}
                </ActionButton>
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3"
                  pending={acao.isPending(s.id)}
                  onClick={() => toggleActive(s)}
                  aria-label={
                    s.active
                      ? `Desativar o setor "${s.name}" — sai das novas pesquisas, os dados ficam`
                      : `Reativar o setor "${s.name}"`
                  }
                >
                  {s.active ? 'Desativar' : 'Reativar'}
                </ActionButton>
                <ActionButton
                  className="btn-ghost text-xs py-1.5 px-3 text-spot-danger"
                  pending={acao.isPending(s.id)}
                  pendingLabel="Excluindo..."
                  onClick={() => remove(s)}
                  aria-label={`Excluir o setor "${s.name}" definitivamente`}
                >
                  Excluir
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      </AsyncSection>

      <form onSubmit={create} className="card flex gap-3 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="novo-setor">Novo setor</label>
          <input id="novo-setor" className="input" required value={newName} onChange={(e) => setNewName(e.target.value)} disabled={criando} />
        </div>
        <ActionButton type="submit" pending={criando} pendingLabel="Adicionando...">Adicionar</ActionButton>
      </form>
      {createError && <p role="alert" className="text-sm text-spot-danger">{createError}</p>}
      <p className="text-xs text-spot-gray-500">
        &quot;Ciclo de cores&quot; é o projeto 🔴 45 / 🟡 120 / 🟢 180 dias: só os setores marcados recebem
        classificação por cor na efetivação e entram no ciclo permanente de feedback. Os demais são efetivados sem
        cor. &quot;Só pesquisa de clima&quot; deixa o setor no formulário da pesquisa e fora do cadastro de funcionários
        e do escopo dos gestores; &quot;Só avaliações&quot; faz o contrário — é como a Administração é dividida por
        gestor (Financeiro, RH, Compras, Manutenção) sem quebrar o anonimato da pesquisa. &quot;Desativar&quot; remove o setor das novas pesquisas sem apagar dados já coletados. &quot;Excluir&quot; apaga
        definitivamente — só é permitido quando o setor não está em uso (sem respostas, planos de ação, funcionários
        ou gestores associados).
      </p>
    </div>
  );
}
