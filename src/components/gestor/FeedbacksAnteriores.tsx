'use client';

import { useState } from 'react';
import { EvaluationCard, type EvaluationRecord } from '@/components/EvaluationCard';

const OPCOES = [2, 3, 4] as const;

/**
 * Consulta dos últimos feedbacks do colaborador, na tela de registrar um novo.
 * É só leitura: mostra os registros como foram gravados (respostas, observações,
 * classificação de cada momento) para o gestor comparar antes de avaliar de
 * novo — nada aqui altera um feedback anterior.
 */
export function FeedbacksAnteriores({ feedbacks }: { feedbacks: EvaluationRecord[] }) {
  const [aberto, setAberto] = useState(false);
  const [quantos, setQuantos] = useState<number>(2);
  if (feedbacks.length === 0) return null;

  // Mais recente primeiro; o número do feedback desempata o mesmo dia.
  const ordenados = [...feedbacks].sort((a, b) =>
    new Date(b.evaluationDate).getTime() - new Date(a.evaluationDate).getTime() || b.cycleNumber - a.cycleNumber);
  const visiveis = ordenados.slice(0, quantos);

  return (
    <section className="card flex flex-col gap-3" aria-label="Feedbacks anteriores">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-sans text-lg font-extrabold tracking-tight text-spot-gray-900">Feedbacks anteriores</p>
          <p className="text-xs text-spot-gray-500 mt-0.5">
            {feedbacks.length === 1 ? 'Há 1 feedback registrado.' : `Há ${feedbacks.length} feedbacks registrados.`} Consulte antes de avaliar.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost text-sm py-2 px-4"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? 'Ocultar' : 'Consultar'}
        </button>
      </div>

      {aberto && (
        <div className="flex flex-col gap-3 animate-fadeIn">
          {feedbacks.length > 2 && (
            <div role="group" aria-label="Quantos feedbacks mostrar" className="flex flex-wrap gap-2">
              {OPCOES.filter((n) => n < feedbacks.length).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={quantos === n}
                  onClick={() => setQuantos(n)}
                  className={`min-h-11 rounded-btn border px-4 text-xs font-semibold transition ${quantos === n ? 'bg-spot-black text-spot-onBlack border-spot-black' : 'border-spot-gray-300 text-spot-gray-700 hover:border-spot-black'}`}
                >
                  Últimos {n}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={quantos >= feedbacks.length}
                onClick={() => setQuantos(feedbacks.length)}
                className={`min-h-11 rounded-btn border px-4 text-xs font-semibold transition ${quantos >= feedbacks.length ? 'bg-spot-black text-spot-onBlack border-spot-black' : 'border-spot-gray-300 text-spot-gray-700 hover:border-spot-black'}`}
              >
                Todos
              </button>
            </div>
          )}
          {visiveis.map((ev) => <EvaluationCard key={ev.id} ev={ev} />)}
        </div>
      )}
    </section>
  );
}
