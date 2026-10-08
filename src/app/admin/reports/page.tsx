'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import {
  ActionButton, AsyncSection, EmptyState, SkeletonCardList, useAsyncData, useToast,
} from '@/components/async';

interface Survey { id: string; name: string; status: string; }

const EXTENSION: Record<string, string> = { pdf: 'pdf', xlsx: 'xlsx', csv: 'csv' };

export default function ReportsPage() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Pesquisa cujo PDF o servidor não conseguiu gerar: oferece a impressão do navegador.
  const [pdfPeloNavegador, setPdfPeloNavegador] = useState<string | null>(null);
  const { mostrar } = useToast();

  const { data, loading, error, reload, reloading } = useAsyncData(
    (signal) => apiFetch<{ surveys: Survey[] }>('/api/admin/surveys', { signal }),
    [],
    { mensagemPadrao: 'Erro ao carregar as pesquisas.' },
  );
  const surveys = data?.surveys ?? [];

  /**
   * Gerar o arquivo pode levar dezenas de segundos (o PDF renderiza gráficos
   * no servidor). O botão fica ocupado o tempo todo, os IRMÃOS dele também —
   * clicar em PDF e depois em XLSX no meio da geração disparava dois trabalhos
   * pesados ao mesmo tempo e ninguém sabia qual arquivo ia chegar.
   */
  const download = async (survey: Survey, format: 'pdf' | 'xlsx' | 'csv') => {
    if (busyKey) return;
    const key = `${survey.id}:${format}`;
    setBusyKey(key);
    setErrorKey(null);
    setErrorMsg(null);
    setPdfPeloNavegador(null);
    try {
      const res = await fetch(`/api/admin/surveys/${survey.id}/export?format=${format}`);
      // 503 = o servidor não tem como abrir o Chromium agora. O mesmo relatório
      // sai pela impressão do navegador, sem mensagem de erro.
      if (format === 'pdf' && res.status === 503) {
        setPdfPeloNavegador(survey.id);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Não foi possível gerar o arquivo (erro ${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spot-clima-${survey.id}.${EXTENSION[format]}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      mostrar(`${format.toUpperCase()} de "${survey.name}" gerado — veja os downloads.`);
    } catch (err) {
      setErrorKey(key);
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao gerar o arquivo.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Relatórios</h1>
        <p className="text-spot-gray-500 text-sm">Gere o relatório executivo de qualquer pesquisa, em PDF, Excel ou CSV.</p>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        retrying={reloading}
        rotulo="as pesquisas"
        skeleton={<SkeletonCardList rows={3} comBadge={false} />}
        empty={surveys.length === 0}
        emptyState={<EmptyState>Nenhuma pesquisa para gerar relatório ainda.</EmptyState>}
      >
        <div className="flex flex-col gap-3">
          {surveys.map((s) => (
            <div key={s.id} className="card flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">{s.name}</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/reports/${s.id}/print`} target="_blank" className="btn-ghost text-sm py-2 px-4">
                    Visualizar relatório
                  </Link>
                  {(['pdf', 'xlsx', 'csv'] as const).map((format) => (
                    <ActionButton
                      key={format}
                      className="btn-ghost text-sm py-2 px-4"
                      pending={busyKey === `${s.id}:${format}`}
                      pendingLabel="Gerando..."
                      disabled={busyKey !== null}
                      onClick={() => download(s, format)}
                    >
                      {format.toUpperCase()}
                    </ActionButton>
                  ))}
                </div>
              </div>
              {pdfPeloNavegador === s.id && (
                <div role="status" className="text-sm bg-spot-white border-l-[3px] border-spot-warning px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span>O PDF sai pela impressão do navegador: abra o relatório e escolha &quot;Salvar como PDF&quot;.</span>
                  <Link href={`/admin/reports/${s.id}/print?imprimir=1`} target="_blank" className="btn-primary text-sm py-2 px-4">
                    Abrir e salvar PDF
                  </Link>
                </div>
              )}
              {errorKey?.startsWith(`${s.id}:`) && errorMsg && (
                <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">
                  {errorMsg}
                </p>
              )}
            </div>
          ))}
        </div>
      </AsyncSection>

      <div className="card">
        <p className="font-semibold mb-2">Compartilhar com gestores</p>
        <p className="text-sm text-spot-gray-500">
          Gestores não acessam os resultados pelo sistema — o painel deles cobre apenas a avaliação de experiência.
          Para compartilhar, use a mesma tela de visualização do relatório: ela já é 100% agregada, sem comentários
          individuais ou qualquer dado que possa identificar quem respondeu. Envie o PDF gerado.
        </p>
      </div>
    </div>
  );
}
