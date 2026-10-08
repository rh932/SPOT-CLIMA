'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, ErrorState, LiveStatus, SkeletonForm, useToast } from '@/components/async';
import { MfaSettingsCard } from '@/components/admin/MfaSettingsCard';
import { CronStatusCard } from '@/components/admin/CronStatusCard';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [companyName, setCompanyName] = useState('Restaurante Spot');
  const [defaultThreshold, setDefaultThreshold] = useState('5');
  const [suggestedPeriodicity, setSuggestedPeriodicity] = useState('6');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ key: string; mensagem: string } | null>(null);
  const { mostrar } = useToast();

  const load = () =>
    apiFetch<{ settings: Record<string, unknown> }>('/api/admin/settings').then((s) => {
      setSettings(s.settings);
      if (s.settings.companyName) setCompanyName(s.settings.companyName as string);
      if (s.settings.defaultAnonymityThreshold) setDefaultThreshold(String(s.settings.defaultAnonymityThreshold));
      if (s.settings.suggestedPeriodicityMonths) setSuggestedPeriodicity(String(s.settings.suggestedPeriodicityMonths));
    });

  const carregar = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    load()
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Erro ao carregar as configurações.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  /**
   * Cada "Salvar" é uma chamada própria.
   *
   * Antes: sem estado de pendência, sem `catch` e com um `setSaved(true)` que
   * aparecia mesmo quando a rota recusava — o RH via "Salvo!" e ia embora com a
   * configuração intacta no banco. Agora o botão mostra que está salvando, o
   * sucesso só aparece depois da resposta, e a falha aparece ao lado do campo.
   */
  const save = async (key: string, value: unknown) => {
    if (salvandoKey) return;
    setSalvandoKey(key);
    setSaveError(null);
    try {
      await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) });
      setSaved(true);
      mostrar('Configuração salva.');
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError({ key, mensagem: e instanceof Error ? e.message : 'Não foi possível salvar.' });
    } finally {
      setSalvandoKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Configurações</h1>
        <p className="text-spot-gray-500 text-sm">Parâmetros gerais do sistema.</p>
      </div>

      {loading ? (
        <div aria-busy="true">
          <LiveStatus>Carregando as configurações...</LiveStatus>
          <SkeletonForm campos={4} />
        </div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={carregar} />
      ) : (
        <>
          <div className="card flex flex-col gap-4">
            <p className="font-semibold">Geral</p>
            <div>
              <label className="label" htmlFor="cfg-nome-empresa">Nome da empresa</label>
              <div className="flex gap-2">
                <input id="cfg-nome-empresa" className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                <ActionButton
                  className="btn-ghost"
                  pending={salvandoKey === 'companyName'}
                  pendingLabel="Salvando..."
                  disabled={salvandoKey !== null}
                  onClick={() => save('companyName', companyName)}
                >
                  Salvar
                </ActionButton>
              </div>
              {saveError?.key === 'companyName' && (
                <p role="alert" className="text-xs text-spot-danger mt-1">{saveError.mensagem}</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="cfg-anonimato">Mínimo de respostas para exibir resultado por setor/unidade (anonimato)</label>
              <div className="flex gap-2">
                <input type="number" min={1} id="cfg-anonimato" className="input" value={defaultThreshold} onChange={(e) => setDefaultThreshold(e.target.value)} />
                <ActionButton
                  className="btn-ghost"
                  pending={salvandoKey === 'defaultAnonymityThreshold'}
                  pendingLabel="Salvando..."
                  disabled={salvandoKey !== null}
                  onClick={() => save('defaultAnonymityThreshold', Number(defaultThreshold))}
                >
                  Salvar
                </ActionButton>
              </div>
              {saveError?.key === 'defaultAnonymityThreshold' && (
                <p role="alert" className="text-xs text-spot-danger mt-1">{saveError.mensagem}</p>
              )}
              <p className="text-xs text-spot-gray-500 mt-1">
                Aplicado como padrão a novas pesquisas. Cada pesquisa pode ter seu próprio limite.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="cfg-periodicidade">Periodicidade sugerida (meses)</label>
              <div className="flex gap-2">
                <input type="number" min={1} id="cfg-periodicidade" className="input" value={suggestedPeriodicity} onChange={(e) => setSuggestedPeriodicity(e.target.value)} />
                <ActionButton
                  className="btn-ghost"
                  pending={salvandoKey === 'suggestedPeriodicityMonths'}
                  pendingLabel="Salvando..."
                  disabled={salvandoKey !== null}
                  onClick={() => save('suggestedPeriodicityMonths', Number(suggestedPeriodicity))}
                >
                  Salvar
                </ActionButton>
              </div>
            </div>
            {saved && <p className="text-xs text-spot-success">Salvo.</p>}
          </div>

          <div className="card">
            <p className="font-semibold mb-3">Classificação do Índice de Clima</p>
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1">85% — 100%</td><td className="py-1 font-medium">Excelente</td></tr>
                <tr><td className="py-1">75% — 84%</td><td className="py-1 font-medium">Bom</td></tr>
                <tr><td className="py-1">65% — 74%</td><td className="py-1 font-medium">Atenção</td></tr>
                <tr><td className="py-1">50% — 64%</td><td className="py-1 font-medium">Crítico</td></tr>
                <tr><td className="py-1">0% — 49%</td><td className="py-1 font-medium">Muito crítico</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-spot-gray-500 mt-2">
              Faixas fixas definidas no briefing do sistema. Para alterar, edite <code>src/lib/calculations.ts</code>.
            </p>
          </div>

          <MfaSettingsCard />

          <CronStatusCard />

          {/* Os usuários ganharam uma aba própria, com busca, filtros e o controle de primeiro acesso. */}
          <Link href="/admin/users" className="card flex items-center justify-between gap-3 hover:bg-spot-gray-50 transition">
            <span>
              <span className="font-semibold block">Usuários e acessos</span>
              <span className="text-sm text-spot-gray-500">Contas do RH, gestores e treinadores, e quem ainda não fez o primeiro login.</span>
            </span>
            <span aria-hidden className="text-spot-gray-500">→</span>
          </Link>
        </>
      )}

    </div>
  );
}

