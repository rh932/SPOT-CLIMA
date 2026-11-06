'use client';

import { useId } from 'react';
import { NOTA_OPCOES, SIM_NAO_OPCOES, type QuestionType } from '@/lib/questionnaire';
import { ChoiceGroup, ChoiceOption } from '@/components/forms/ChoiceGroup';

export interface PerguntaExtra {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  /** Só na prévia: marca a pergunta que ainda não foi aprovada. */
  selo?: string;
}

/**
 * Perguntas extras do setor (criadas pelo PJ e aprovadas pelo RH), no fim do formulário.
 * A mesma peça serve para avaliar de verdade e para a prévia da aba Questionários
 * (`somenteLeitura`): o PJ vê exatamente o que o gestor vai ver.
 */
export function PerguntasExtrasCard({
  titulo = 'Perguntas do setor', perguntas, respostas, onResposta, mostrarErro = false, somenteLeitura = false,
}: {
  titulo?: string;
  perguntas: PerguntaExtra[];
  respostas: Record<string, string>;
  onResposta?: (id: string, valor: string) => void;
  mostrarErro?: boolean;
  somenteLeitura?: boolean;
}) {
  const base = useId();
  if (perguntas.length === 0) return null;
  const falta = (p: PerguntaExtra) => mostrarErro && p.required && !(respostas[p.id] ?? '').trim();

  return (
    <div className="card flex flex-col gap-5" data-erro={perguntas.some(falta) ? 'true' : undefined}>
      <p className="font-sans text-lg font-extrabold tracking-tight text-spot-gray-900">{titulo}</p>
      {perguntas.map((p) => {
        const valor = respostas[p.id] ?? '';
        const erro = falta(p);
        const legenda = (
          <span className="block text-sm font-medium text-spot-gray-800 mb-2 break-words">
            {p.text}
            {!p.required && <span className="text-spot-gray-500 font-normal"> (opcional)</span>}
            {p.selo && <span className="badge bg-spot-yellow text-spot-onYellow ml-2 align-middle">{p.selo}</span>}
          </span>
        );
        return (
          <div key={p.id} data-erro={erro ? 'true' : undefined} className={erro ? 'rounded-btn ring-2 ring-spot-danger p-2 -m-2' : ''}>
            {p.type === 'TEXTO' ? (
              <label className="block">
                {legenda}
                <textarea
                  className="input min-h-[80px] resize-y"
                  maxLength={3000}
                  value={valor}
                  disabled={somenteLeitura}
                  onChange={(e) => onResposta?.(p.id, e.target.value)}
                />
              </label>
            ) : (
              <ChoiceGroup legenda={legenda} invalido={erro}>
                <div className={`grid gap-2 ${p.type === 'NOTA' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                  {(p.type === 'NOTA' ? NOTA_OPCOES : SIM_NAO_OPCOES).map((opt) => (
                    <ChoiceOption
                      key={opt.value}
                      name={`${base}-${p.id}`}
                      value={opt.value}
                      checked={valor === opt.value}
                      disabled={somenteLeitura}
                      onChange={() => onResposta?.(p.id, opt.value)}
                      className={`flex items-center justify-center min-h-11 rounded-btn border px-3 py-2.5 text-sm font-semibold text-center transition active:scale-[0.97] ${
                        valor === opt.value ? 'bg-spot-black text-spot-onBlack border-spot-black' : 'border-spot-gray-300 hover:border-spot-black text-spot-gray-700'
                      }`}
                    >
                      {opt.label}
                    </ChoiceOption>
                  ))}
                </div>
              </ChoiceGroup>
            )}
            {erro && <p className="text-xs text-spot-danger mt-1">Responda esta pergunta.</p>}
          </div>
        );
      })}
    </div>
  );
}
