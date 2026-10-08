'use client';

import { useState } from 'react';
import { ApiClientError, apiFetch } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';

/**
 * Excluir colaborador, nos dois painéis.
 *
 * A rota faz a exclusão em dois tempos: a primeira chamada, sem `?confirm`,
 * devolve 409 com a contagem de avaliações e treinamentos vinculados; só a
 * segunda, com `confirm=true`, apaga de verdade (as tabelas filhas caem por
 * cascade). Esta tela existe para ATRAVESSAR esse fluxo direito — dizer o que
 * some antes de sumir.
 *
 * Um `confirm()` do navegador não serve aqui: ele não sabe quantos registros
 * estão em jogo, e mandar `confirm=true` de saída joga fora exatamente a
 * proteção que a rota oferece.
 */
export function EmployeeDeleteButton({
  employeeId,
  employeeName,
  apiBase,
  onDeleted,
  className = '',
}: {
  employeeId: string;
  employeeName: string;
  /** `/api/admin/employees` ou `/api/gestor/employees`. */
  apiBase: string;
  onDeleted: () => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [vinculados, setVinculados] = useState<{ evaluations: number; trainings: number } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Ja tinha role=dialog; faltava o comportamento de teclado — e este e o
  // painel que apaga colaborador e historico.
  const painelRef = usePainelModal<HTMLDivElement>({
    aberto: aberto,
    aoFechar: () => setAberto(false),
    podeFechar: !excluindo,
  });

  const abrir = async () => {
    setErro(null);
    setVinculados(null);
    setExcluindo(true);
    try {
      // Primeira chamada sem `confirm`: ou não há vínculo e o colaborador é
      // apagado direto, ou a rota recusa com a contagem para mostrarmos.
      await apiFetch(`${apiBase}/${employeeId}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 409 && e.data.requiresConfirmation) {
        setVinculados(e.data.related as { evaluations: number; trainings: number });
        setAberto(true);
      } else {
        setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
      }
    } finally {
      setExcluindo(false);
    }
  };

  const confirmar = async () => {
    setExcluindo(true);
    setErro(null);
    try {
      await apiFetch(`${apiBase}/${employeeId}?confirm=true`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
      setExcluindo(false);
    }
  };

  const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

  return (
    <>
      <div className="flex flex-col gap-2 items-start">
        <button
          type="button"
          onClick={abrir}
          disabled={excluindo}
          className={`btn-ghost text-spot-danger border-spot-gray-300 hover:border-spot-danger ${className}`}
        >
          {excluindo && !aberto ? 'Excluindo...' : 'Excluir colaborador'}
        </button>
        {erro && !aberto && (
          <p className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{erro}</p>
        )}
      </div>

      {aberto && vinculados && (
        <div className="modal-overlay" onClick={() => !excluindo && setAberto(false)}>
          <div
            ref={painelRef}
            className="modal-panel bg-spot-white w-full max-w-md rounded-xl2 p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
            /* alertdialog, nao dialog: e uma confirmacao destrutiva, e o papel
               faz o leitor de tela anunciar o texto de aviso junto. */
            role="alertdialog"
            aria-modal="true"
            aria-label={`Confirmar a exclusão de ${employeeName}`}
          >
            <h2 className="font-display text-xl font-semibold">Excluir {employeeName}?</h2>

            <div className="text-sm text-spot-gray-700 leading-relaxed flex flex-col gap-2">
              <p>Este colaborador tem histórico registrado. Será apagado junto:</p>
              <ul className="list-disc pl-5 text-spot-gray-600">
                {vinculados.evaluations > 0 && (
                  <li>{plural(vinculados.evaluations, 'avaliação', 'avaliações')} (45/90 dias e feedbacks)</li>
                )}
                {vinculados.trainings > 0 && (
                  <li>{plural(vinculados.trainings, 'treinamento', 'treinamentos')}, com as respostas de cada um</li>
                )}
                <li>as mudanças de classificação por cor e os avisos dele</li>
              </ul>
              <p className="font-semibold text-spot-gray-900">Isso não pode ser desfeito.</p>
            </div>

            {erro && <p className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{erro}</p>}

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" className="btn-ghost sm:flex-1" onClick={() => setAberto(false)} disabled={excluindo}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger sm:flex-1"
                onClick={confirmar}
                disabled={excluindo}
              >
                {excluindo ? 'Excluindo...' : 'Excluir mesmo assim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
