'use client';

import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, Skeleton, Spinner } from '@/components/async';

interface ParsedQuestionRow {
  row: number;
  categoria?: string;
  text: string;
  type: string;
  required: boolean;
  options?: string[];
}
interface ImportRowError { row: number; errors: string[]; }

/**
 * Painel de importação de perguntas via Excel — usado tanto no editor de
 * perguntas de pesquisa quanto no de modelo. `previewUrl`/`confirmUrl` são
 * os endpoints do alvo (pesquisa ou modelo) que o chamador informa.
 */
export function ImportQuestionsPanel({
  previewUrl,
  confirmUrl,
  onImported,
}: {
  previewUrl: string;
  confirmUrl: string;
  onImported: () => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [validRows, setValidRows] = useState<ParsedQuestionRow[]>([]);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [previewed, setPreviewed] = useState(false);
  const [ignoreErrors, setIgnoreErrors] = useState(false);
  /**
   * Duas esperas diferentes, dois estados diferentes.
   *
   * Antes as duas usavam o mesmo `loading` e a mesma frase "Processando...".
   * Ler a planilha e gravar as perguntas são ações distintas — quem confirmou
   * a importação precisa saber que o que está rodando agora é a GRAVAÇÃO, e
   * não a leitura de novo.
   */
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const loading = lendo || importando;
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const reset = () => {
    setValidRows([]);
    setErrors([]);
    setPreviewed(false);
    setIgnoreErrors(false);
    setResult(null);
    setError(null);
    setNomeArquivo(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePreview = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // O nome do arquivo aparece na hora: em rede lenta, o único retorno era o
    // campo de arquivo mudando de texto, e nada dizia que a planilha estava
    // sendo enviada.
    setNomeArquivo(file.name);
    setLendo(true);
    setError(null);
    setResult(null);
    setPreviewed(false);
    setValidRows([]);
    setErrors([]);
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await apiFetch<{ rows: ParsedQuestionRow[]; errors: ImportRowError[] }>(previewUrl, {
        method: 'POST',
        body: form,
      });
      setValidRows(data.rows);
      setErrors(data.errors);
      setPreviewed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler a planilha.');
    } finally {
      setLendo(false);
    }
  };

  const confirm = async () => {
    if (importando) return;
    setImportando(true);
    setError(null);
    try {
      const data = await apiFetch<{ count: number }>(confirmUrl, {
        method: 'POST',
        body: JSON.stringify({ rows: validRows }),
      });
      setResult(`${data.count} pergunta(s) importada(s) com sucesso.`);
      setValidRows([]);
      setErrors([]);
      setPreviewed(false);
      if (fileRef.current) fileRef.current.value = '';
      setNomeArquivo(null);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar perguntas.');
    } finally {
      setImportando(false);
    }
  };

  const canConfirm = previewed && validRows.length > 0 && (errors.length === 0 || ignoreErrors);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="font-semibold">Importar perguntas via Excel</p>
        {/* Download de arquivo da API: <a> de propósito — <Link> tentaria navegar dentro do app. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/admin/templates/import-template" download className="btn-ghost text-xs py-1.5 px-3">
          Baixar modelo Excel
        </a>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx" onChange={handlePreview} className="text-sm" disabled={loading} />

      {lendo && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <p className="text-sm text-spot-gray-600 flex items-center gap-2">
            <Spinner className="h-3.5 w-3.5" />
            Lendo {nomeArquivo ? `"${nomeArquivo}"` : 'a planilha'}...
          </p>
          {/* Esqueleto da prévia: a tabela de conferência é o que vem a seguir. */}
          <div aria-hidden className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
      {result && (
        <p role="status" aria-live="polite" className="text-sm text-spot-gray-800 bg-spot-white border-l-[3px] border-spot-success px-3 py-2.5">
          {result}
        </p>
      )}

      {previewed && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-spot-gray-600">
            {validRows.length} linha(s) válida(s), {errors.length} linha(s) com erro.
          </p>
          {errors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200">
                    <th className="py-1.5 pr-3">Linha</th>
                    <th className="py-1.5 pr-3">Erro(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e) => (
                    <tr key={e.row} className="border-b border-spot-gray-100">
                      <td className="py-1.5 pr-3 font-semibold">{e.row}</td>
                      <td className="py-1.5 pr-3 text-spot-danger">{e.errors.join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {errors.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-spot-black"
                checked={ignoreErrors}
                onChange={(e) => setIgnoreErrors(e.target.checked)}
              />
              Importar mesmo assim, ignorando as {errors.length} linha(s) com erro
            </label>
          )}
          <div className="flex gap-3">
            <button type="button" className="btn-ghost" onClick={reset} disabled={importando}>Cancelar</button>
            <ActionButton
              type="button"
              className="btn-primary flex-1"
              pending={importando}
              pendingLabel={`Importando ${validRows.length} pergunta(s)...`}
              disabled={!canConfirm}
              onClick={confirm}
            >
              Confirmar importação ({validRows.length})
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
