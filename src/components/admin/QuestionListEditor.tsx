'use client';

import { TYPE_LABEL, type Dimension, type EditableQuestion } from './QuestionModal';

export interface QuestionListItem extends EditableQuestion {
  order: number;
  dimension: Dimension | null;
}

/**
 * Lista + reordenar + remover de perguntas, compartilhada entre o editor de
 * perguntas de pesquisa e o de modelo.
 *
 * AUDITORIA DE RÓTULOS — o que estava errado aqui
 *
 * Os 12 controles desta tela tinham problema, os 12. Medido no navegador:
 *
 *  - "↑" e "↓" eram o conteúdo INTEIRO do botão. O leitor de tela anuncia o
 *    nome do caractere ("seta para cima") e mais nada: não diz o que sobe, nem
 *    para onde vai. Numa lista de 30 perguntas isso é indecifrável.
 *  - "Editar" e "Remover" se repetiam uma vez por pergunta. Quem navega pela
 *    lista de botões do leitor de tela ouvia "Editar, Remover, Editar,
 *    Remover..." sem nenhuma âncora — e "Remover" apaga uma pergunta.
 *  - Todos mediam ~21px de altura (as setas, 23x21px), contra os 44px que o
 *    resto do projeto já adota como alvo mínimo de toque.
 *
 * A CORREÇÃO
 *
 * O texto visível continua o mesmo — a tela não muda para quem enxerga. O que
 * muda é o nome acessível: cada botão passa a dizer sobre QUAL pergunta age e,
 * no caso das setas, para qual posição ela vai. O `title` acompanha o mesmo
 * texto para quem usa mouse e tem dúvida, mas nunca é a única fonte: `title`
 * não existe no toque e vários leitores o ignoram.
 */

/** Trecho da pergunta que cabe num rótulo falado sem virar um parágrafo. */
function resumo(texto: string, limite = 50): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}...`;
}

export function QuestionListEditor({
  questions,
  canEdit,
  onEdit,
  onReorder,
  onDelete,
}: {
  questions: QuestionListItem[];
  canEdit: boolean;
  onEdit: (q: QuestionListItem) => void;
  onReorder: (q: QuestionListItem, swapWith: QuestionListItem) => void;
  onDelete: (q: QuestionListItem) => void;
}) {
  const sorted = [...questions].sort((a, b) => a.order - b.order);

  return (
    <ol className="flex flex-col gap-2">
      {sorted.map((q, i) => {
        const posicao = `${i + 1}`;
        const curto = resumo(q.text);
        const primeira = i === 0;
        const ultima = i === sorted.length - 1;
        // Nos extremos o botão fica desabilitado, e um leitor de tela em modo
        // de leitura ainda anuncia botões desabilitados: "para a posição 0"
        // seria uma instrução sem sentido. O rótulo diz por que não dá.
        const subirPara = primeira
          ? `A pergunta ${posicao} (${curto}) já é a primeira`
          : `Mover a pergunta ${posicao} (${curto}) para a posição ${i}`;
        const descerPara = ultima
          ? `A pergunta ${posicao} (${curto}) já é a última`
          : `Mover a pergunta ${posicao} (${curto}) para a posição ${i + 2}`;

        return (
          <li key={q.id} className="card flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-semibold text-spot-gray-500">
                  <span aria-hidden>#{posicao}</span>
                  <span className="sr-only">Pergunta {posicao} de {sorted.length}</span>
                </span>
                {q.dimension && <span className="badge bg-spot-gray-100 text-spot-gray-600">{q.dimension.name}</span>}
                <span className="badge bg-spot-gray-100 text-spot-gray-600">{q.isEnps ? 'eNPS (0 a 10)' : TYPE_LABEL[q.type] ?? q.type}</span>
                {q.required && <span className="badge bg-spot-yellow/30 text-spot-yellowDark">Obrigatória</span>}
              </div>
              <p className="text-sm text-spot-gray-800">{q.text}</p>
              {q.options.length > 0 && (
                <p className="text-xs text-spot-gray-500 mt-1">{q.options.map((o) => o.label).join(' · ')}</p>
              )}
              {q.type === 'SCALE' && q.scaleMin != null && q.scaleMax != null && (
                <p className="text-xs text-spot-gray-500 mt-1">Escala de {q.scaleMin} a {q.scaleMax}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex flex-col gap-1 items-end shrink-0">
                <div className="flex gap-1">
                  {/* min-h-11 min-w-11: eram 23x21px. A seta é o controle mais
                      fácil de errar no celular — e errar aqui reordena o
                      questionário inteiro. */}
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 !min-h-11 min-w-11 text-xs"
                    onClick={() => sorted[i - 1] && onReorder(q, sorted[i - 1])}
                    disabled={primeira}
                    aria-label={subirPara}
                    title={subirPara}
                  >
                    <span aria-hidden>↑</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 !min-h-11 min-w-11 text-xs"
                    onClick={() => sorted[i + 1] && onReorder(q, sorted[i + 1])}
                    disabled={ultima}
                    aria-label={descerPara}
                    title={descerPara}
                  >
                    <span aria-hidden>↓</span>
                  </button>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-ghost !px-3 !py-1 !min-h-11 text-xs"
                    onClick={() => onEdit(q)}
                    aria-label={`Editar a pergunta ${posicao}: ${curto}`}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-3 !py-1 !min-h-11 text-xs text-spot-danger"
                    onClick={() => onDelete(q)}
                    aria-label={`Remover a pergunta ${posicao}: ${curto}`}
                  >
                    Remover
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
