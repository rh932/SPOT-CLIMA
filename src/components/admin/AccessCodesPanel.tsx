'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, ErrorState, SkeletonText, useConfirm, useToast } from '@/components/async';

interface Status {
  requireAccessCode: boolean;
  total: number;
  used: number;
  available: number;
}

interface Lote {
  batch: number;
  surveyName: string;
  surveyUrl: string;
  slips: { code: string; qr: string }[];
}

/**
 * Códigos de participação da pesquisa: gerar, imprimir e exigir.
 *
 * Os códigos só aparecem na tela logo depois de gerados (o banco guarda o
 * HMAC). Por isso a impressão sai daqui mesmo: um papelzinho por pessoa, com o
 * código e o QR que abre a pesquisa já com ele preenchido.
 */
export function AccessCodesPanel({ surveyId, encerrada }: { surveyId: string; encerrada: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState('50');
  const [lote, setLote] = useState<Lote | null>(null);
  const [pendente, setPendente] = useState<'gerar' | 'exigir' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const carregar = useCallback(() => {
    setErroCarga(null);
    apiFetch<Status>(`/api/admin/surveys/${surveyId}/access-codes`)
      .then(setStatus)
      .catch((e) => setErroCarga(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, [surveyId]);
  useEffect(() => { carregar(); }, [carregar]);
  // Vindo do atalho "Códigos de participação" da lista: a página carrega
  // depois da navegação, então o navegador não rola sozinho até a âncora.
  const carregado = status !== null;
  useEffect(() => {
    if (carregado && window.location.hash === '#codigos') {
      document.getElementById('codigos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [carregado]);

  const gerar = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(quantidade);
    if (!Number.isInteger(n) || n < 1 || n > 500) { setErro('Informe de 1 a 500 códigos por vez.'); return; }
    setPendente('gerar');
    setErro(null);
    try {
      const r = await apiFetch<Lote>(`/api/admin/surveys/${surveyId}/access-codes`, {
        method: 'POST',
        body: JSON.stringify({ quantity: n }),
      });
      setLote(r);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível gerar.');
    } finally {
      setPendente(null);
    }
  };

  const alternar = async (exigir: boolean) => {
    if (exigir && !(await confirmar({
      titulo: 'Exigir código para responder?',
      texto: 'A partir de agora, só responde quem tiver um código. Distribua os papéis antes de avisar a equipe.',
      acao: 'Exigir código',
    }))) return;
    setPendente('exigir');
    setErro(null);
    try {
      await apiFetch(`/api/admin/surveys/${surveyId}/access-codes`, {
        method: 'PATCH',
        body: JSON.stringify({ requireAccessCode: exigir }),
      });
      mostrar(exigir ? 'A pesquisa agora exige código.' : 'A pesquisa voltou a aceitar resposta sem código.');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível alterar.');
    } finally {
      setPendente(null);
    }
  };

  const imprimir = () => {
    // Só os papéis vão para a impressora (ver .imprimindo-codigos em globals.css).
    document.body.classList.add('imprimindo-codigos');
    const limpar = () => {
      document.body.classList.remove('imprimindo-codigos');
      window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);
    window.print();
  };

  const baixarLista = () => {
    if (!lote) return;
    const linhas = ['codigo', ...lote.slips.map((s) => s.code)].join('\r\n');
    const url = URL.createObjectURL(new Blob([linhas], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `codigos-lote-${lote.batch}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="codigos" className="card flex flex-col gap-4 scroll-mt-24" aria-labelledby="codigos-titulo">
      <div>
        <h2 id="codigos-titulo" className="font-semibold">Códigos de participação</h2>
        <p className="text-sm text-spot-gray-500">
          Um papel por pessoa, cada código vale uma resposta. Impede que alguém responda várias vezes para
          descobrir, por subtração, o que um colega respondeu. O código não fica ligado à resposta.
        </p>
      </div>

      {erroCarga ? (
        <ErrorState message={erroCarga} onRetry={carregar} />
      ) : !status ? (
        <SkeletonText lines={2} />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-spot-gray-50 p-3"><dt className="text-xs text-spot-gray-500">Gerados</dt><dd className="text-xl font-semibold">{status.total}</dd></div>
            <div className="bg-spot-gray-50 p-3"><dt className="text-xs text-spot-gray-500">Usados</dt><dd className="text-xl font-semibold">{status.used}</dd></div>
            <div className="bg-spot-gray-50 p-3"><dt className="text-xs text-spot-gray-500">Livres</dt><dd className="text-xl font-semibold">{status.available}</dd></div>
          </dl>

          <p className="text-sm">
            {status.requireAccessCode
              ? <><strong>Exigindo código.</strong> Só responde quem tem um papel.</>
              : <>Hoje a pesquisa <strong>aceita resposta sem código</strong>.</>}
          </p>

          {!encerrada && (
            <form onSubmit={gerar} className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="label">Quantos papéis gerar</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="input w-32"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </label>
              <ActionButton type="submit" className="btn-primary" pending={pendente === 'gerar'} pendingLabel="Gerando...">
                Gerar códigos
              </ActionButton>
              {status.requireAccessCode ? (
                <ActionButton type="button" className="btn-ghost" pending={pendente === 'exigir'} onClick={() => alternar(false)}>
                  Parar de exigir
                </ActionButton>
              ) : (
                <ActionButton
                  type="button"
                  className="btn-ghost"
                  pending={pendente === 'exigir'}
                  disabled={status.available === 0}
                  onClick={() => alternar(true)}
                >
                  Exigir código
                </ActionButton>
              )}
            </form>
          )}
          {erro && <p role="alert" className="text-sm text-spot-danger">{erro}</p>}

          {lote && (
            <div className="flex flex-col gap-3 border-t border-spot-gray-200 pt-4">
              <p className="text-sm text-spot-gray-900">
                <strong>Lote {lote.batch}: {lote.slips.length} código(s).</strong> Imprima agora — por segurança, eles não
                aparecem de novo depois que você sair desta tela.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="btn-primary" onClick={imprimir}>Imprimir papéis</button>
                <button type="button" className="btn-ghost" onClick={baixarLista}>Baixar lista (CSV)</button>
                <button type="button" className="btn-ghost" onClick={() => setLote(null)}>Fechar</button>
              </div>
              <div className="print-slips grid grid-cols-2 sm:grid-cols-3 gap-0">
                {lote.slips.map((s) => (
                  <div key={s.code} className="print-slip border border-dashed border-spot-gray-300 p-3 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data: URI gerada no servidor */}
                    <img src={s.qr} alt="" width={72} height={72} className="w-[72px] h-[72px] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] leading-tight text-spot-gray-500">{lote.surveyName}</p>
                      <p className="font-mono text-base font-semibold tracking-[0.15em]">{s.code}</p>
                      <p className="text-[10px] leading-tight text-spot-gray-500">
                        Leia o QR ou acesse {lote.surveyUrl.replace(/^https?:\/\//, '')} e digite o código. Anônimo.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
