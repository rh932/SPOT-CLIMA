'use client';

import { useId } from 'react';
import { ChoiceGroup, ChoiceOption } from '@/components/forms/ChoiceGroup';

export type AnswerValue = { numericValue?: number; textValue?: string; choiceValues?: string[] };

export interface QuestionData {
  id: string;
  text: string;
  type: 'LIKERT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_TEXT' | 'LONG_TEXT' | 'SCALE' | 'YES_NO';
  required: boolean;
  options: { id: string; label: string }[];
  scaleMin?: number | null;
  scaleMax?: number | null;
  /** Pergunta de eNPS (0 a 10): ganha a legenda das pontas. */
  isEnps?: boolean;
}

/*
 * Resposta em TECLA ("Placa de serviço"): filete de tinta e sombra sólida de
 * 3px; a escolhida fica afundada (desce os 3px e perde a sombra) e acesa em
 * tinta. Dá para ver de longe qual foi marcada, e o dedo sente o clique.
 */
const TECLA = 'border-[1.5px] border-spot-gray-900 bg-spot-white text-spot-gray-900 shadow-[0_3px_0_rgb(var(--spot-gray-900))] hover:bg-spot-gray-50';
const TECLA_ACESA = 'border-[1.5px] border-spot-gray-900 bg-spot-black text-spot-onBlack translate-y-[3px] shadow-none';

const LIKERT_OPTIONS = [
  { value: 1, label: 'Muito em desacordo' },
  { value: 2, label: 'Em desacordo' },
  { value: 3, label: 'Nem de acordo nem em desacordo' },
  { value: 4, label: 'De acordo' },
  { value: 5, label: 'Totalmente de acordo' },
];

export function QuestionField({
  question,
  value,
  onChange,
  showError,
}: {
  question: QuestionData;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  showError: boolean;
}) {
  const idEnunciado = useId();
  const idErro = useId();
  const idCampo = useId();

  /**
   * O enunciado, pronto para virar rótulo de qualquer tipo de resposta.
   *
   * O asterisco era um `<span>` sem texto: quem usa leitor de tela não tinha
   * como saber que a pergunta era obrigatória — ouvia a pergunta e mais nada,
   * e só descobria ao ser barrado no "Próximo". Agora o "*" é decorativo
   * (aria-hidden) e a informação vai por escrito, no `sr-only`.
   */
  const enunciado = (
    <span id={idEnunciado} className="block font-display italic text-[1.375rem] sm:text-2xl leading-snug text-spot-gray-900 mb-4">
      {question.text}
      {question.required && (
        <>
          <span aria-hidden className="text-spot-yellowDark ml-1">*</span>
          <span className="sr-only"> (obrigatória)</span>
        </>
      )}
    </span>
  );

  const descrito = showError ? idErro : undefined;

  return (
    <div className={`card ${showError ? 'ring-2 ring-spot-danger' : ''}`}>
      {/* Tipos com <input> nativo (escolha única/múltipla, texto) trazem o
          enunciado no seu próprio rótulo; os demais recebem via ChoiceGroup. */}
      {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') && enunciado}

      {question.type === 'LIKERT' && (
        <ChoiceGroup legenda={enunciado} invalido={showError} idDescricao={descrito}>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {LIKERT_OPTIONS.map((opt) => (
              <ChoiceOption
                key={opt.value}
                name={question.id}
                value={String(opt.value)}
                checked={value?.numericValue === opt.value}
                onChange={() => onChange({ numericValue: opt.value })}
                className={`block rounded-btn px-3 py-3 text-xs sm:text-[13px] leading-snug text-center transition-[transform,box-shadow,background-color] duration-100 active:translate-y-[3px] active:shadow-none ${
                  value?.numericValue === opt.value
                    ? TECLA_ACESA
                    : TECLA
                }`}
              >
                {/* O número é enfeite: o rótulo já diz "De acordo". Lê-lo
                    também faria o leitor anunciar "4 De acordo". */}
                <span aria-hidden className="block font-sans text-xl font-extrabold tracking-tight mb-1">{opt.value}</span>
                {opt.label}
              </ChoiceOption>
            ))}
          </div>
        </ChoiceGroup>
      )}

      {question.type === 'SCALE' && question.scaleMin != null && question.scaleMax != null && (
        <ChoiceGroup legenda={enunciado} invalido={showError} idDescricao={descrito}>
          {/* 0 a 10 são 11 notas: com 10 colunas a última caía sozinha na linha de baixo. */}
          <div className={`grid gap-2 ${question.scaleMax - question.scaleMin + 1 === 11 ? 'grid-cols-6 sm:grid-cols-11' : 'grid-cols-5 sm:grid-cols-10'}`}>
            {Array.from(
              { length: question.scaleMax - question.scaleMin + 1 },
              (_, i) => (question.scaleMin as number) + i
            ).map((n) => (
              <ChoiceOption
                key={n}
                name={question.id}
                value={String(n)}
                checked={value?.numericValue === n}
                onChange={() => onChange({ numericValue: n })}
                className={`block rounded-btn py-3 text-base font-extrabold text-center transition-[transform,box-shadow,background-color] duration-100 active:translate-y-[3px] active:shadow-none ${
                  value?.numericValue === n
                    ? TECLA_ACESA
                    : TECLA
                }`}
              >
                <span aria-hidden>{n}</span>
                {/* "7, botão" não diz nada. O nome precisa carregar a escala,
                    senão a pessoa não sabe se 7 é muito ou pouco. */}
                <span className="sr-only">Nota {n} de {question.scaleMax}</span>
              </ChoiceOption>
            ))}
          </div>
          {question.isEnps && (
            <p aria-hidden className="flex justify-between text-xs text-spot-gray-500 mt-2">
              <span>0 = nada provável</span>
              <span>10 = muito provável</span>
            </p>
          )}
        </ChoiceGroup>
      )}

      {question.type === 'YES_NO' && (
        <ChoiceGroup legenda={enunciado} invalido={showError} idDescricao={descrito}>
          <div className="flex gap-3">
            {['Sim', 'Não'].map((label) => (
              <ChoiceOption
                key={label}
                name={question.id}
                value={label}
                checked={value?.choiceValues?.[0] === label}
                onChange={() => onChange({ choiceValues: [label] })}
                wrapperClassName="flex-1"
                className={`block text-center rounded-btn px-4 py-3 text-base font-semibold transition-[transform,box-shadow,background-color] duration-100 active:translate-y-[3px] active:shadow-none ${
                  value?.choiceValues?.[0] === label
                    ? TECLA_ACESA
                    : TECLA
                }`}
              >
                {label}
              </ChoiceOption>
            ))}
          </div>
        </ChoiceGroup>
      )}

      {question.type === 'SINGLE_CHOICE' && (
        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={idEnunciado} aria-describedby={descrito}>
          {question.options.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-2.5 rounded-btn border px-3.5 py-2.5 cursor-pointer transition ${
                value?.choiceValues?.[0] === opt.label
                  ? 'border-spot-black bg-spot-gray-50'
                  : 'border-spot-gray-300 hover:border-spot-gray-500'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                className="accent-spot-black"
                checked={value?.choiceValues?.[0] === opt.label}
                onChange={() => onChange({ choiceValues: [opt.label] })}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === 'MULTIPLE_CHOICE' && (
        <div className="flex flex-col gap-2" role="group" aria-labelledby={idEnunciado} aria-describedby={descrito}>
          {question.options.map((opt) => {
            const checked = value?.choiceValues?.includes(opt.label) ?? false;
            return (
              <label
                key={opt.id}
                className={`flex items-center gap-2.5 rounded-btn border px-3.5 py-2.5 cursor-pointer transition ${
                  checked ? 'border-spot-black bg-spot-gray-50' : 'border-spot-gray-300 hover:border-spot-gray-500'
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-spot-black"
                  checked={checked}
                  onChange={() => {
                    const current = value?.choiceValues ?? [];
                    const next = checked ? current.filter((v) => v !== opt.label) : [...current, opt.label];
                    onChange({ choiceValues: next });
                  }}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* O enunciado vira <label> DE VERDADE do campo. Antes ele era um <p>
          solto e o único rótulo do campo era o placeholder "Sua resposta" —
          que some no primeiro caractere digitado. Quem chegasse no campo pelo
          teclado ouvia "Sua resposta, edição de texto", sem a pergunta. */}
      {(question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') && (
        <>
          <label htmlFor={idCampo}>{enunciado}</label>
          {question.type === 'SHORT_TEXT' ? (
            <input
              id={idCampo}
              type="text"
              className="input"
              maxLength={300}
              required={question.required}
              aria-invalid={showError || undefined}
              aria-describedby={descrito}
              value={value?.textValue ?? ''}
              onChange={(e) => onChange({ textValue: e.target.value })}
              placeholder="Sua resposta"
            />
          ) : (
            <textarea
              id={idCampo}
              className="input min-h-[110px] resize-y"
              maxLength={2000}
              required={question.required}
              aria-invalid={showError || undefined}
              aria-describedby={descrito}
              value={value?.textValue ?? ''}
              onChange={(e) => onChange({ textValue: e.target.value })}
              placeholder={question.required ? 'Sua resposta' : 'Sua resposta (opcional)'}
            />
          )}
        </>
      )}

      {showError && <p id={idErro} className="text-xs text-spot-danger mt-2">Esta pergunta é obrigatória.</p>}
    </div>
  );
}
