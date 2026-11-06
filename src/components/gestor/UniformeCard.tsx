'use client';

import { useId } from 'react';
import { RATING_OPTIONS, RATING_LABELS, type RatingOption } from '@/data/evaluationBank';
import { UNIFORME_PERGUNTA } from '@/data/uniforme';
import { ChoiceGroup, ChoiceOption } from '@/components/forms/ChoiceGroup';

/** Avaliação do uniforme no feedback do Salão (Atendimento, Bar e Gerência): nota e observação. */
export function UniformeCard({
  rating, onRating, notes, onNotes, mostrarErro,
}: {
  rating: RatingOption | null;
  onRating: (v: RatingOption) => void;
  notes: string;
  onNotes: (t: string) => void;
  mostrarErro: boolean;
}) {
  const idErro = useId();
  const faltando = mostrarErro && !rating;
  return (
    <div data-erro={faltando ? 'true' : undefined} className={`card flex flex-col gap-4 ${faltando ? 'ring-2 ring-spot-danger' : ''}`}>
      <p className="font-sans text-lg font-extrabold tracking-tight text-spot-gray-900">Uniforme</p>
      <ChoiceGroup
        legenda={<span className="block text-sm font-medium text-spot-gray-800 mb-2">{UNIFORME_PERGUNTA}</span>}
        invalido={faltando}
        idDescricao={faltando ? idErro : undefined}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RATING_OPTIONS.map((opt) => (
            <ChoiceOption
              key={opt}
              name="uniforme-nota"
              value={opt}
              checked={rating === opt}
              onChange={() => onRating(opt)}
              className={`flex items-center justify-center min-h-11 rounded-btn border px-3 py-2.5 text-sm font-semibold text-center transition active:scale-[0.97] ${
                rating === opt ? 'bg-spot-black text-spot-onBlack border-spot-black' : 'border-spot-gray-300 hover:border-spot-black text-spot-gray-700'
              }`}
            >
              {RATING_LABELS[opt]}
            </ChoiceOption>
          ))}
        </div>
      </ChoiceGroup>
      <label className="block">
        <span className="label">Observação sobre o uniforme (opcional)</span>
        <textarea className="input min-h-[70px] resize-y" maxLength={3000} value={notes} onChange={(e) => onNotes(e.target.value)} />
      </label>
      {faltando && <p id={idErro} className="text-xs text-spot-danger">Dê uma nota ao uniforme.</p>}
    </div>
  );
}
