'use client';

import { EVALUATION_DIMENSIONS, CLASSIFICATION_OPTIONS, CONCLUSION_OPTIONS } from '@/data/evaluationBank';
import { setorAvaliaUniforme } from '@/data/uniforme';
import { PerguntasExtrasCard, type PerguntaExtra } from '@/components/gestor/PerguntasExtrasCard';
import { STATUS_LABEL, type QuestionForm, type QuestionStatus, type QuestionType } from '@/lib/questionnaire';

interface Pergunta { id: string; text: string; type: QuestionType; required: boolean; status: QuestionStatus; order: number }

/** Bloco fixo do formulário padrão, só para situar onde as perguntas extras entram. */
function BlocoFixo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border border-dashed border-spot-gray-300 bg-spot-gray-50 px-4 py-3 flex flex-col gap-1.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Fixo no sistema · {titulo}</p>
      <div className="text-sm text-spot-gray-700 break-words">{children}</div>
    </div>
  );
}

/**
 * Prévia: o formulário na ordem em que o gestor vai preenchê-lo. O que é padrão aparece
 * resumido e tracejado; as perguntas do setor aparecem como vão ficar, com selo nas que
 * ainda não foram aprovadas (essas NÃO aparecem para quem avalia).
 */
export function FormularioPrevia({
  setor, form, perguntas,
}: {
  setor: { name: string; usesColorCycle: boolean; usesFeedback: boolean };
  form: QuestionForm;
  perguntas: Pergunta[];
}) {
  const extras: PerguntaExtra[] = [...perguntas]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id, text: p.text, type: p.type, required: p.required,
      selo: p.status === 'APROVADA' ? undefined : STATUS_LABEL[p.status] + ' · não aparece ainda',
    }));
  const naoAprovadas = perguntas.filter((p) => p.status !== 'APROVADA').length;
  const feedbackLigado = setor.usesFeedback || setor.usesColorCycle;

  return (
    <div className="flex flex-col gap-4 min-w-0" aria-label={`Prévia do formulário de ${form === 'DESEMPENHO' ? 'desempenho' : 'feedback'} de ${setor.name}`}>
      <p className="text-sm text-spot-gray-600">
        É assim que o gestor de <strong>{setor.name}</strong> vai ver o formulário de {form === 'DESEMPENHO' ? 'desempenho (45 e 90 dias)' : 'feedback'}.
        {naoAprovadas > 0 && ` ${naoAprovadas} ${naoAprovadas === 1 ? 'pergunta ainda não foi aprovada e não aparece' : 'perguntas ainda não foram aprovadas e não aparecem'} para quem avalia.`}
      </p>

      {form === 'FEEDBACK' && !feedbackLigado && (
        <p className="text-sm bg-spot-white border-l-[3px] border-spot-warning px-3 py-2.5">
          O setor {setor.name} ainda não faz feedback, então este formulário não está disponível para os gestores.
        </p>
      )}

      <BlocoFixo titulo="Data da avaliação">Data em que a avaliação foi feita.</BlocoFixo>

      <BlocoFixo titulo={form === 'DESEMPENHO' ? 'Dimensões do desempenho' : 'Dimensões do feedback'}>
        {EVALUATION_DIMENSIONS.map((d) => d.name).join(' · ')}. Cada uma com nota (Ótimo, Bom, Regular, Ruim) e sub-perguntas.
        {form === 'FEEDBACK' && ' Nas unidades Paulista e JK o feedback usa o roteiro PDI no lugar delas.'}
      </BlocoFixo>

      {form === 'FEEDBACK' && setorAvaliaUniforme(setor.name) && (
        <BlocoFixo titulo="Uniforme">Nota única para a apresentação do uniforme, com observação opcional.</BlocoFixo>
      )}

      {extras.length > 0
        ? <PerguntasExtrasCard perguntas={extras} respostas={{}} somenteLeitura />
        : (
          <div className="rounded-xl2 border-2 border-dashed border-spot-gray-300 px-4 py-6 text-center text-sm text-spot-gray-500">
            As perguntas do setor aparecem aqui. Ainda não há nenhuma.
          </div>
        )}

      <BlocoFixo titulo="Avaliação final">
        Aspectos favoráveis e desfavoráveis, classificação geral ({CLASSIFICATION_OPTIONS.map((c) => c.label.replace(/\.$/, '')).join('; ')})
        {form === 'DESEMPENHO' ? ` e conclusão (${CONCLUSION_OPTIONS.map((c) => c.label.replace(/\.$/, '')).join('; ')}).` : '.'}
      </BlocoFixo>

      {form === 'FEEDBACK' && setor.usesColorCycle && (
        <BlocoFixo titulo="Classificação por cor">🔴 45 dias · 🟡 120 dias · 🟢 180 dias — define a data do próximo feedback.</BlocoFixo>
      )}
    </div>
  );
}
