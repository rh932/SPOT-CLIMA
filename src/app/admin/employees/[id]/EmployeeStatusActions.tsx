'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { useConfirm, useToast } from '@/components/async';
import type { StatusActionsEmployee } from '@/components/TerminationSection';

// O bloco de desligamento é compartilhado com o portal do gestor.
export { TerminationSection, type StatusActionsEmployee } from '@/components/TerminationSection';

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
