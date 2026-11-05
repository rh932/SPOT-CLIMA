'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, Spinner } from '@/components/async';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';

type Status = 'OK' | 'DUPLICADO' | 'ERRO';
interface PreviewRow {
  line: number;
  fullName: string;
  unitName: string;
  sectorName: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  admissionDate: string | null;
  track: 'NOVO' | 'ATIVO';
  unitId: string | null;
  sectorId: string | null;
  status: Status;
  messages: string[];
  warnings: string[];
}
interface Preview {
  rows: PreviewRow[];
  fileErrors: string[];
  counts: { total: number; ok: number; duplicado: number; erro: number };
}
interface Resultado {
  importados: number;
  ignorados: { line?: number; fullName: string; motivo: string }[];
}

const STATUS_LABEL: Record<Status, string> = { OK: 'Importar', DUPLICADO: 'Duplicado', ERRO: 'Corrigir' };
const STATUS_CLASS: Record<Status, string> = {
  OK: 'text-spot-gray-900',
  DUPLICADO: 'text-spot-gray-600',
  ERRO: 'text-spot-danger',
};

/**
 * Importação em massa de colaboradores ativos (Excel ou CSV). Fluxo em três
 * passos: enviar → conferir a prévia → confirmar. Quem já está cadastrado
 * aparece como "duplicado" e nunca é alterado.
 */
export default function ImportarColaboradoresPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'TODOS' | Status>('TODOS');

  const reset = () => {
    setPreview(null); setResultado(null); setError(null); setNomeArquivo(null); setFiltro('TODOS');
    if (fileRef.current) fileRef.current.value = '';
  };

  const enviar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name); setLendo(true); setError(null); setPreview(null); setResultado(null); setFiltro('TODOS');
    try {
      const form = new FormData();
      form.append('file', file);
      setPreview(await apiFetch<Preview>('/api/admin/employees/import/preview', { method: 'POST', body: form }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler a planilha.');
    } finally {
      setLendo(false);
    }
  };

  const aImportar = useMemo(() => preview?.rows.filter((r) => r.status === 'OK') ?? [], [preview]);
  const visiveis = useMemo(
    () => (preview?.rows ?? []).filter((r) => filtro === 'TODOS' || r.status === filtro),
    [preview, filtro],
  );

  const confirmar = async () => {
    if (importando || aImportar.length === 0) return;
    setImportando(true); setError(null);
    try {
      const data = await apiFetch<Resultado>('/api/admin/employees/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          rows: aImportar.map((r) => ({
            line: r.line, fullName: r.fullName, roleDescription: r.roleDescription,
            admissionDate: r.admissionDate, unitId: r.unitId, sectorId: r.sectorId,
            shift: r.shift, track: r.track,
          })),
        }),
      });
      setResultado(data);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar colaboradores.');
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Importar colaboradores"
        subtitulo="Envie uma planilha (Excel ou CSV) com os colaboradores ativos. Quem já está cadastrado não é alterado."
        acao={<Link href="/admin/cadastrar" className="btn-ghost">Cadastrar um por um</Link>}
      />

      <div className="card flex flex-col gap-3 max-w-3xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="font-semibold">1. Envie a planilha</p>
          {/* Download de arquivo da API: <a> de propósito — <Link> tentaria navegar dentro do app. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/admin/employees/import/template" download className="btn-ghost text-xs py-1.5 px-3">
            Baixar modelo Excel
          </a>
        </div>
        <p className="text-xs text-spot-gray-600">
          Colunas: Nome completo, Unidade e Setor são obrigatórias; Cargo, Turno, Data de admissão e Tipo são opcionais.
          Colaborador ativo participa só do feedback — sem treinamento nem avaliação de experiência.
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" onChange={enviar} className="text-sm" disabled={lendo || importando} />
        {lendo && (
          <p role="status" aria-live="polite" className="text-sm text-spot-gray-600 flex items-center gap-2">
            <Spinner className="h-3.5 w-3.5" /> Lendo {nomeArquivo ? `"${nomeArquivo}"` : 'a planilha'}...
          </p>
        )}
        {error && <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
      </div>

      {preview && preview.fileErrors.length > 0 && (
        <div role="alert" className="card max-w-3xl text-sm text-spot-danger">
          {preview.fileErrors.map((m) => <p key={m}>{m}</p>)}
        </div>
      )}

      {preview && preview.rows.length > 0 && (
        <div className="card flex flex-col gap-4">
          <p className="font-semibold">2. Confira a prévia</p>
          <div className="flex flex-wrap gap-2">
            {([
              ['TODOS', `Todos (${preview.counts.total})`],
              ['OK', `Para importar (${preview.counts.ok})`],
              ['DUPLICADO', `Duplicados (${preview.counts.duplicado})`],
              ['ERRO', `Com erro (${preview.counts.erro})`],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFiltro(k)}
                aria-pressed={filtro === k}
                className={`min-h-11 px-3 rounded-btn border text-sm ${filtro === k ? 'border-spot-gray-900 bg-spot-cream font-semibold' : 'border-spot-gray-300'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[40rem]">
              <thead>
                <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200">
                  <th className="py-1.5 pr-3">Linha</th>
                  <th className="py-1.5 pr-3">Nome</th>
                  <th className="py-1.5 pr-3">Unidade</th>
                  <th className="py-1.5 pr-3">Setor</th>
                  <th className="py-1.5 pr-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr key={r.line} className="border-b border-spot-gray-100 align-top">
                    <td className="py-1.5 pr-3 font-semibold">{r.line}</td>
                    <td className="py-1.5 pr-3">{r.fullName || '—'}</td>
                    <td className="py-1.5 pr-3">{r.unitName || '—'}</td>
                    <td className="py-1.5 pr-3">{r.sectorName || '—'}</td>
                    <td className={`py-1.5 pr-3 ${STATUS_CLASS[r.status]}`}>
                      <span className="font-semibold">{STATUS_LABEL[r.status]}</span>
                      {[...r.messages, ...r.warnings].map((m) => <span key={m} className="block text-spot-gray-600">{m}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <button type="button" className="btn-ghost" onClick={reset} disabled={importando}>Cancelar</button>
            <ActionButton
              type="button"
              className="btn-primary"
              pending={importando}
              pendingLabel={`Importando ${aImportar.length} colaborador(es)...`}
              disabled={aImportar.length === 0}
              onClick={confirmar}
            >
              Importar {aImportar.length} colaborador(es)
            </ActionButton>
          </div>
          {preview.counts.erro > 0 && (
            <p className="text-xs text-spot-gray-600">
              As {preview.counts.erro} linha(s) com erro ficam de fora. Corrija a planilha e envie de novo: quem já foi importado aparecerá como duplicado, sem problema.
            </p>
          )}
        </div>
      )}

      {resultado && (
        <div role="status" className="card max-w-3xl flex flex-col gap-2">
          <p className="font-semibold">3. Resultado</p>
          <p className="text-sm">{resultado.importados} colaborador(es) importado(s) com sucesso.</p>
          {resultado.ignorados.length > 0 && (
            <ul className="text-xs text-spot-gray-600 list-disc pl-5">
              {resultado.ignorados.map((i, n) => (
                <li key={n}>{i.line ? `Linha ${i.line}: ` : ''}{i.fullName} — {i.motivo}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-3 mt-1">
            <button type="button" className="btn-ghost" onClick={reset}>Importar outra planilha</button>
            <Link href="/admin/employees" className="btn-primary">Ver funcionários</Link>
          </div>
        </div>
      )}
    </div>
  );
}
