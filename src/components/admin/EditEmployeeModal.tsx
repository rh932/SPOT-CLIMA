'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, useAsyncData } from '@/components/async';
import { usePainelModal } from '@/components/forms/usePainelModal';
import {
  alteracoesDoColaborador, diaDaAdmissao, type DadosDoColaborador,
} from '@/lib/employeeEdit';

interface Lookup { id: string; name: string; }
interface SectorLookup extends Lookup { inEvaluation: boolean; }

export interface EditableEmployee {
  id: string;
  fullName: string;
  admissionDate: string;
  roleDescription: string;
  sectorId: string;
  unitId: string;
  shift: 'DIA' | 'NOITE';
}

/**
 * Correção do cadastro de um colaborador (nome, admissão, cargo, setor, unidade
 * e turno). Serve para consertar um cadastro feito errado. A admissão só muda
 * antes da primeira avaliação, como a rota já exige: depois dela os prazos de
 * 45 e 90 dias já valeram.
 *
 * Aprendiz não aparece aqui de propósito: quem marca ou desmarca é o botão
 * próprio da ficha, porque isso muda a situação do colaborador.
 */
export function EditEmployeeModal({
  employee, hasEvaluations, onClose, onSaved,
}: {
  employee: EditableEmployee;
  hasEvaluations: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const original: DadosDoColaborador = {
    fullName: employee.fullName,
    admissionDate: diaDaAdmissao(employee.admissionDate),
    roleDescription: employee.roleDescription,
    sectorId: employee.sectorId,
    unitId: employee.unitId,
    shift: employee.shift,
  };
  const [form, setForm] = useState<DadosDoColaborador>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  const { data: lookups, loading, error: erroCarga, reload } = useAsyncData(
    async (signal) => {
      const [sec, uni] = await Promise.all([
        apiFetch<{ sectors: SectorLookup[] }>('/api/admin/sectors', { signal }),
        apiFetch<{ units: Lookup[] }>('/api/admin/units', { signal }),
      ]);
      // O setor atual entra mesmo fora da avaliação (ex.: Administração geral),
      // senão o select não teria onde mostrar quem já está nele.
      return {
        sectors: sec.sectors.filter((s) => s.inEvaluation || s.id === employee.sectorId),
        units: uni.units,
      };
    },
    [],
    { mensagemPadrao: 'Erro ao carregar setores e unidades.' },
  );

  const set = <K extends keyof DadosDoColaborador>(campo: K, valor: DadosDoColaborador[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const mudanca = alteracoesDoColaborador(original, form);
    if (Object.keys(mudanca).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/employees/${employee.id}`, { method: 'PATCH', body: JSON.stringify(mudanca) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar o cadastro.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fadeIn">
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Editar cadastro do funcionário"
        className="bg-spot-white rounded-xl2 max-w-md w-full p-6 flex flex-col gap-4 modal-panel"
      >
        <h2 className="font-sans text-xl font-extrabold tracking-tight">Editar cadastro</h2>
        <div>
          <label className="block">
            <span className="label">Nome completo</span>
            <input required minLength={2} className="input" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Data de admissão</span>
            <input
              required
              type="date"
              className="input"
              value={form.admissionDate}
              disabled={hasEvaluations}
              onChange={(e) => set('admissionDate', e.target.value)}
            />
          </label>
          {hasEvaluations ? (
            <p className="text-xs text-spot-gray-500 mt-1">Já há avaliação registrada: a data de admissão não pode mais ser alterada.</p>
          ) : (
            <p className="text-xs text-spot-gray-500 mt-1">Os prazos de 45 e 90 dias são recalculados a partir dela.</p>
          )}
        </div>
        <div>
          <label className="block">
            <span className="label">Cargo / função</span>
            <input required minLength={2} className="input" value={form.roleDescription} onChange={(e) => set('roleDescription', e.target.value)} />
          </label>
        </div>

        {erroCarga ? (
          <div className="flex flex-col gap-2 items-start">
            <p role="alert" className="text-sm text-spot-danger">{erroCarga}</p>
            <button type="button" className="btn-ghost py-2 px-4 text-sm" onClick={reload}>Tentar de novo</button>
          </div>
        ) : (
          <>
            <div>
              <label className="block">
                <span className="label">Setor</span>
                <select required className="input" value={form.sectorId} disabled={loading} onChange={(e) => set('sectorId', e.target.value)}>
                  {loading && <option value={form.sectorId}>Carregando...</option>}
                  {lookups?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Unidade</span>
                <select required className="input" value={form.unitId} disabled={loading} onChange={(e) => set('unitId', e.target.value)}>
                  {loading && <option value={form.unitId}>Carregando...</option>}
                  {lookups?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Turno</span>
                <select required className="input" value={form.shift} onChange={(e) => set('shift', e.target.value as 'DIA' | 'NOITE')}>
                  <option value="DIA">Diurno</option>
                  <option value="NOITE">Noturno</option>
                </select>
              </label>
              <p className="text-xs text-spot-gray-500 mt-1">Junto com o setor e a unidade, define quais gestores ficam responsáveis por avaliar este funcionário.</p>
            </div>
          </>
        )}

        {error && <p role="alert" className="text-sm text-spot-danger">{error}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
          <ActionButton type="submit" className="btn-primary flex-1" pending={saving} pendingLabel="Salvando..." disabled={loading || Boolean(erroCarga)}>
            Salvar
          </ActionButton>
        </div>
      </form>
    </div>
  );
}
