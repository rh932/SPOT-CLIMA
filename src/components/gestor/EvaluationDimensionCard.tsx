'use client';

import { useId } from 'react';
import type { EvaluationDimension, RatingOption, SubAnswerOption } from '@/data/evaluationBank';
import { RATING_OPTIONS, RATING_LABELS, SUB_ANSWER_LABELS } from '@/data/evaluationBank';
import { ChoiceGroup, ChoiceOption } from '@/components/forms/ChoiceGroup';

/**
 * Um bloco de dimensão da ficha de avaliação.
 *
 * As notas eram `<button>` com a escolha indicada só pelo fundo preto: medido
 * na tela, depois de clicar em "Ótimo" o botão seguia com `role=button`,
 * `aria-pressed=null` e `aria-checked=null` — quem usa leitor de tela ouvia
 * "Ótimo, botão" antes e depois, e não tinha como conferir a ficha antes de
 * enviar. São 40 botões desses numa avaliação. Agora cada série é um
 * radiogroup de verdade (ver ChoiceGroup), com a mesma aparência.
 */
export function EvaluationDimensionCard({
  dimension,
  rating,
  subAnswers,
  onRatingChange,
  onSubAnswerChange,
  showError,
}: {
  dimension: EvaluationDimension;
  rating: RatingOption | null;
  subAnswers: Record<string, SubAnswerOption | null>;
  onRatingChange: (v: RatingOption) => void;
  onSubAnswerChange: (key: string, v: SubAnswerOption) => void;
  showError: boolean;
}) {
  const idErro = useId();

  return (
    <div className={`card flex flex-col gap-4 ${showError ? 'ring-2 ring-spot-danger' : ''}`}>
      <p className="font-display text-lg font-semibold text-spot-gray-900">{dimension.name}</p>

      <ChoiceGroup
        legenda={<span className="block text-sm font-medium text-spot-gray-800 mb-2">{dimension.gradedQuestion}</span>}
        invalido={showError && !rating}
        idDescricao={showError ? idErro : undefined}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RATING_OPTIONS.map((opt) => (
            <ChoiceOption
              key={opt}
              /* O nome amarra o grupo: sem ele, escolher uma nota numa dimensão
                 desmarcaria a nota de outra. */
              name={`${dimension.key}-nota`}
              value={opt}
              checked={rating === opt}
              onChange={() => onRatingChange(opt)}
              /* min-h-11: media 42px, dois pixels abaixo do alvo minimo. */
              className={`flex items-center justify-center min-h-11 rounded-btn border px-3 py-2.5 text-sm font-semibold text-center transition active:scale-[0.97] ${
                rating === opt ? 'bg-spot-black text-spot-onBlack border-spot-black' : 'border-spot-gray-300 hover:border-spot-black text-spot-gray-700'
              }`}
            >
              {RATING_LABELS[opt]}
            </ChoiceOption>
          ))}
        </div>
      </ChoiceGroup>

      <div className="flex flex-col gap-3 pt-1 border-t border-spot-gray-100">
        {dimension.subQuestions.map((sq) => (
          <ChoiceGroup
            key={sq.key}
            legenda={<span className="block text-sm text-spot-gray-700 mb-2">{sq.text}</span>}
            invalido={showError && !subAnswers[sq.key]}
          >
            <div className="flex gap-2 flex-wrap">
              {sq.options.map((opt) => (
                <ChoiceOption
                  key={opt}
                  name={`${dimension.key}-${sq.key}`}
                  value={opt}
                  checked={subAnswers[sq.key] === opt}
                  onChange={() => onSubAnswerChange(sq.key, opt)}
                  /* min-h-11: media 34px — a sub-resposta era o menor alvo
                     da ficha, e sao 24 delas por avaliacao. */
                  className={`flex items-center justify-center min-h-11 rounded-btn border px-4 py-2 text-xs font-semibold transition active:scale-[0.97] ${
                    subAnswers[sq.key] === opt ? 'bg-spot-black text-spot-onBlack border-spot-black' : 'border-spot-gray-300 hover:border-spot-black text-spot-gray-700'
                  }`}
                >
                  {SUB_ANSWER_LABELS[opt]}
                </ChoiceOption>
              ))}
            </div>
          </ChoiceGroup>
        ))}
      </div>

      {showError && (
        <p id={idErro} className="text-xs text-spot-danger">Preencha todas as perguntas desta dimensão.</p>
      )}
    </div>
  );
}
