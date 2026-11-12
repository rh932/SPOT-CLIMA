'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { useConfirm, useToast } from '@/components/async';
import { TERMINATION_LABELS, TERMINATION_REASONS, type TerminationReason } from '@/lib/termination';

export interface StatusActionsEmployee {
  id: string;
  fullName: string;
  status: 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';
  isApprentice?: boolean;
  terminationReason: TerminationReason | null;
  terminationDate: string | null;
  terminationNotes: string | null;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Desligamento registrado pelo RH: pedido de demissão, abandono, dispensa...
 * Sem isto, quem saía no meio da experiência sem avaliação continuava na
 * lista como "Aguardando 1º ciclo" e o gestor seguia recebendo lembrete.
 */
export function TerminationSection({
  employee, onChanged, podeDesfazer = true,
}: { employee: StatusActionsEmployee; onChanged: () => Promise<unknown>; podeDesfazer?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [reason, setReason] = useState<TerminationReason | ''>(employee.terminationReason ?? '');
  const [date, setDate] = useState(
    employee.terminationDate ? new Date(employee.terminationDate).toISOString().slice(0, 10) : hojeIso(),
  );
  const [notes, setNotes] = useState(employee.terminationNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmar = useConfirm();
  const { mostrar } = useToast();

  const salvar = async () => {
    if (!reason) { setError('Escolha o motivo do desligamento.'); return; }
    if (!date) { setError('Informe a data de saída.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/employees/${employee.id}/termination`, {
        method: 'POST',
        // T12:00 evita que o fuso jogue a data para o dia anterior ao virar UTC.
        body: JSON.stringify({ reason, date: new Date(`${date}T12:00:00`).toISOString(), notes: notes.trim() || undefined }),
      });
      setEditando(false);
      mostrar('Desligamento registrado.');
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar o desligamento.');
    } finally {
      setSaving(false);
    }
  };

  const desfazer = async () => {
    const ok = await confirmar({
      titulo: `Desfazer o desligamento de ${employee.fullName}?`,
      texto: 'Motivo e data saem do cadastro, e a situação volta a ser a que as avaliações registradas dão.',
      acao: 'Desfazer desligamento',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/employees/${employee.id}/termination`, { method: 'DELETE' });
      mostrar('Desligamento desfeito.');
      await onChanged();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Não foi possível desfazer o desligamento.', 'erro');
    }
  };

  const desligado = employee.status === 'TERMINATED';

  if (!editando) {
    if (!desligado) {
      return (
        <button type="button" className="btn-ghost text-sm self-start py-2 px-4" onClick={() => setEditando(true)}>
          Registrar desligamento
        </button>
      );
    }
    return (
      <div className="card flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Desligamento</p>
        {employee.terminationReason ? (
          <>
            <p className="font-semibold">
              {TERMINATION_LABELS[employee.terminationReason]}
              <span className="font-normal text-spot-gray-500">
                {' · '}
                {employee.terminationDate ? `saída em ${formatDate(employee.terminationDate)}` : 'data de saída não informada'}
              </span>
            </p>
            {employee.terminationNotes && <p className="text-sm text-spot-gray-600">{employee.terminationNotes}</p>}
            <div className="flex flex-wrap gap-2 mt-1">
              <button type="button" className="btn-ghost text-sm py-2 px-4" onClick={() => setEditando(true)}>Corrigir</button>
              {podeDesfazer && (
                <button type="button" className="btn-ghost text-sm py-2 px-4" onClick={desfazer}>Desfazer desligamento</button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-spot-gray-600">Desligado pela avaliação de experiência (conclusão &quot;Demitir&quot;).</p>
            <button type="button" className="btn-ghost text-sm self-start py-2 px-4" onClick={() => setEditando(true)}>
              Informar motivo e data de saída
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Desligamento</p>
      <label className="block">
        <span className="label">Motivo</span>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value as TerminationReason)}>
          <option value="">Selecione</option>
          {TERMINATION_REASONS.map((r) => <option key={r} value={r}>{TERMINATION_LABELS[r]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Data de saída</span>
        <input type="date" className="input" value={date} max={hojeIso()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Descrição (opcional)</span>
        <input
          className="input"
          maxLength={300}
          placeholder="Ex.: Pedido de demissão - aviso prévio não trabalhado"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="text-xs text-spot-gray-500">
        O colaborador sai das pendências e os gestores deixam de receber lembrete dele.
      </p>
      {error && <p role="alert" className="text-sm text-spot-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost text-sm py-2 px-4"
          onClick={() => { setEditando(false); setError(null); }}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="button" className="btn-primary text-sm py-2 px-4" onClick={salvar} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar desligamento'}
        </button>
      </div>
    </div>
  );
}

/** Jovem aprendiz: sem prazo de 45/90, sem lembrete e sem avaliação de experiência. */
export function ApprenticeToggle({
  employee, onChanged,
}: { employee: StatusActionsEmployee; onChanged: () => Promise<unknown> }) {
  const [saving, setSaving] = useState(false);
  const confirmar = useConfirm();
  const { mostrar } = useToast();

  if (employee.status === 'TERMINATED') return null;

  const alternar = async () => {
    const vira = !employee.isApprentice;
    const ok = await confirmar({
      titulo: vira ? `Marcar ${employee.fullName} como jovem aprendiz?` : `Tirar a marcação de aprendiz de ${employee.fullName}?`,
      texto: vira
        ? 'Os prazos de 45 e 90 dias deixam de valer e os gestores não recebem mais lembrete de avaliação dele.'
        : 'Ele volta para o ciclo de experiência, com os prazos contados da data de admissão.',
      acao: vira ? 'Marcar como aprendiz' : 'Tirar marcação',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/employees/${employee.id}`, { method: 'PATCH', body: JSON.stringify({ isApprentice: vira }) });
      mostrar(vira ? 'Marcado como jovem aprendiz.' : 'Marcação de aprendiz removida.');
      await onChanged();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Não foi possível alterar.', 'erro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={saving}
      className="text-xs text-spot-gray-500 underline underline-offset-2 hover:text-spot-gray-900 transition"
    >
      {employee.isApprentice ? 'Não é jovem aprendiz? Tirar a marcação' : 'É jovem aprendiz? Marcar (sem prazo de 45/90)'}
    </button>
  );
}
