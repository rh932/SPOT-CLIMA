import type { TimelineEvent } from '@/lib/employeeTimeline';

const formatDate = (value: Date) => value.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const KIND_STYLE: Record<TimelineEvent['kind'], { dot: string; label: string }> = {
  ADMISSAO: { dot: 'bg-spot-gray-400', label: 'Admissão' },
  EXPERIENCIA: { dot: 'bg-spot-black', label: 'Avaliação de experiência' },
  FEEDBACK: { dot: 'bg-spot-yellow', label: 'Feedback' },
  COR: { dot: 'bg-spot-yellow', label: 'Classificação' },
  // Fora da paleta do projeto (era sky-500); o cinza medio distingue sem
  // introduzir uma sexta cor so para este marcador.
  TREINAMENTO: { dot: 'bg-spot-gray-600', label: 'Treinamento' },
  DESLIGAMENTO: { dot: 'bg-spot-gray-800', label: 'Desligamento' },
};

/**
 * Linha do tempo da jornada do colaborador, nos dois painéis (RH e operação).
 * Só desenha o que `buildEmployeeTimeline` entrega: cada etapa com nome, data,
 * responsável, classificação, próxima data prevista e o atalho para o registro
 * completo (a âncora `#avaliacao-<id>` que o cartão da avaliação reconhece).
 */
export function LinhaDoTempo({ eventos }: { eventos: TimelineEvent[] }) {
  return (
    <section className="card flex flex-col gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Linha do tempo</p>
      <ol className="flex flex-col">
        {eventos.map((ev, i) => (
          <li key={ev.id} className="flex gap-3">
            {/* Trilho: ponto do evento e a linha que liga ao próximo. */}
            <div className="flex flex-col items-center shrink-0 pt-1.5">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${KIND_STYLE[ev.kind].dot}`} />
              {i < eventos.length - 1 && <span aria-hidden className="w-px flex-1 bg-spot-gray-200 my-1" />}
            </div>
            <div className={`min-w-0 ${i < eventos.length - 1 ? 'pb-5' : ''}`}>
              <p className="text-xs text-spot-gray-500">
                {formatDate(ev.date)} · {KIND_STYLE[ev.kind].label}
              </p>
              <p className="font-semibold text-sm leading-snug">{ev.title}</p>
              {ev.detail && <p className="text-sm text-spot-gray-600 leading-snug">{ev.detail}</p>}
              {ev.nextDate && (
                <p className="text-xs text-spot-gray-500 mt-0.5">Próxima data prevista: {formatDate(ev.nextDate)}</p>
              )}
              {ev.author && <p className="text-xs text-spot-gray-500 mt-0.5">por {ev.author}</p>}
              {ev.evaluationId && (
                <a href={`#avaliacao-${ev.evaluationId}`} className="text-xs font-semibold underline underline-offset-2 mt-0.5 inline-block">
                  Ver detalhes do registro
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
