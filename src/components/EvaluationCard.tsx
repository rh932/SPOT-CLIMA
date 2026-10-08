'use client';

import { useState } from 'react';
import {
  EVALUATION_DIMENSIONS, SUB_ANSWER_LABELS, CLASSIFICATION_OPTIONS, CONCLUSION_OPTIONS,
  type RatingOption, type SubAnswerOption,
} from '@/data/evaluationBank';
import { deliveredOnTime } from '@/lib/probation';
import { COLOR_OPTIONS, COLOR_LABELS, type FeedbackColor } from '@/lib/feedbackCycle';
import { StarRating } from '@/components/StarRating';

/**
 * Uma avaliação registrada, com tudo o que foi preenchido nela — notas, textos,
 * classificação, conclusão e cor. Nasceu na ficha do RH e passou a ser
 * compartilhada com a ficha do portal da operação: o histórico de avaliações é
 * o mesmo registro permanente nos dois lados, e não deve divergir.
 */

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

export interface EvaluationRecord {
  id: string;
  period: 'FIRST' | 'SECOND' | 'FEEDBACK';
  cycleNumber: number;
  evaluationDate: string;
  favorableAspects: string;
  unfavorableAspects: string;
  classification: string;
  conclusion: string | null;
  color: FeedbackColor | null;
  nextDueDate: string | null;
  developmentPoints: string | null;
  guidance: string | null;
  trainingNeeds: string | null;
  evaluator: { name: string } | null;
  evaluatorName: string | null;
  source: 'SISTEMA' | 'FORMS';
  dueDateAtEvaluation: string;
  [key: string]: unknown;
}

export function EvaluationCard({ ev }: { ev: EvaluationRecord }) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="font-bold">
          {ev.period === 'FIRST' ? '1º ciclo (45 dias)' : ev.period === 'SECOND' ? '2º ciclo (90 dias)' : `${ev.cycleNumber}º feedback`}
          {/* Dois gestores no setor: os dois podem ter avaliado o mesmo período. */}
          {ev.period !== 'FEEDBACK' && ev.cycleNumber > 1 && (
            <span className="font-normal text-spot-gray-500"> · {ev.cycleNumber}ª resposta</span>
          )}
        </p>
        <span className="text-xs text-spot-gray-500">
          {formatDate(ev.evaluationDate)} · avaliado por {ev.evaluator?.name ?? ev.evaluatorName ?? '—'}
        </span>
      </div>
      {ev.period !== 'FEEDBACK' && (() => {
        const entrega = deliveredOnTime(ev.evaluationDate, ev.dueDateAtEvaluation);
        return (
          <p className="text-xs -mt-2 flex flex-wrap gap-x-2">
            <span className={entrega.onTime ? 'text-spot-gray-500' : 'text-[#C93A3A] font-semibold'}>
              {entrega.onTime
                ? `Entregue no prazo (contrato até ${formatDate(ev.dueDateAtEvaluation)})`
                : `Entregue ${entrega.daysLate} ${entrega.daysLate === 1 ? 'dia' : 'dias'} depois do fim do contrato (${formatDate(ev.dueDateAtEvaluation)})`}
            </span>
            {ev.source === 'FORMS' && <span className="text-spot-gray-500">· veio do Google Forms</span>}
          </p>
        );
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {EVALUATION_DIMENSIONS.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-3 border-b border-spot-gray-100 pb-1">
            <span className="text-spot-gray-600">{d.name}</span>
            <StarRating rating={ev[`${d.key}Rating`] as RatingOption} />
          </div>
        ))}
      </div>

      <div className="text-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1">Aspectos mais favoráveis</p>
        <p>{ev.favorableAspects}</p>
      </div>
      <div className="text-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1">Aspectos menos favoráveis</p>
        <p>{ev.unfavorableAspects}</p>
      </div>
      {ev.developmentPoints && (
        <div className="text-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1">Pontos de desenvolvimento</p>
          <p>{ev.developmentPoints}</p>
        </div>
      )}
      {ev.guidance && (
        <div className="text-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1">Orientações</p>
          <p>{ev.guidance}</p>
        </div>
      )}
      {ev.trainingNeeds && (
        <div className="text-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1">Necessidade de treinamento</p>
          <p>{ev.trainingNeeds}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="badge bg-spot-gray-100 text-spot-gray-600">
          {CLASSIFICATION_OPTIONS.find((c) => c.value === ev.classification)?.label}
        </span>
        {/* Conclusão só existe na experiência — um feedback não demite nem efetiva. */}
        {ev.conclusion && (
          <span className="badge bg-spot-yellow text-spot-onYellow">
            {CONCLUSION_OPTIONS.find((c) => c.value === ev.conclusion)?.label}
          </span>
        )}
        {ev.color && (
          <span className={`badge ${COLOR_OPTIONS.find((c) => c.value === ev.color)?.className} flex items-center gap-1.5`}>
            <span className={`h-2 w-2 rounded-full ${COLOR_OPTIONS.find((c) => c.value === ev.color)?.dotClassName}`} />
            {COLOR_LABELS[ev.color]}
            {ev.nextDueDate && ` · próximo em ${formatDate(ev.nextDueDate)}`}
          </span>
        )}
      </div>

      <button
        type="button"
        className="btn-ghost text-sm self-start py-2 px-4"
        onClick={() => setShowAll((v) => !v)}
        aria-expanded={showAll}
      >
        {showAll ? 'Ocultar respostas' : 'Ver avaliação completa'}
      </button>

      {showAll && (
        <div className="flex flex-col gap-4 border-t border-spot-gray-100 pt-4 animate-fadeIn">
          {EVALUATION_DIMENSIONS.map((d) => {
            const subAnswers = (ev[`${d.key}SubAnswers`] ?? {}) as Record<string, SubAnswerOption>;
            return (
              <div key={d.key} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{d.name}</p>
                    <p className="text-xs text-spot-gray-500">{d.gradedQuestion}</p>
                  </div>
                  <StarRating rating={ev[`${d.key}Rating`] as RatingOption} showLabel />
                </div>
                <ul className="flex flex-col gap-1.5">
                  {d.subQuestions.map((q) => {
                    const answer = subAnswers[q.key];
                    return (
                      <li key={q.key} className="flex items-start justify-between gap-3 text-sm border-b border-spot-gray-100 pb-1.5">
                        <span className="text-spot-gray-600">{q.text}</span>
                        <span className="font-semibold shrink-0">
                          {answer ? SUB_ANSWER_LABELS[answer] : 'Sem resposta'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
