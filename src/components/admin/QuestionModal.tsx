'use client';

import { useState } from 'react';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { ENPS_DEFAULT_TEXT } from '@/lib/enps';

export interface Dimension { id: string; name: string; }
export interface QuestionOption { id?: string; label: string; order?: number; }
export interface EditableQuestion {
  id: string;
  text: string;
  type: string;
  required: boolean;
  dimensionId: string | null;
  options: QuestionOption[];
  scaleMin?: number | null;
  scaleMax?: number | null;
  isEnps?: boolean;
}

export interface QuestionSubmitPayload {
  text: string;
  type: string;
  dimensionId: string | null;
  required: boolean;
  options: { label: string; order: number }[];
  scaleMin?: number | null;
  scaleMax?: number | null;
  isEnps?: boolean;
}

/** Valor do select para a pergunta de eNPS — vira SCALE 0–10 com a marca isEnps. */
const ENPS_OPTION = '__ENPS';

export const TYPE_LABEL: Record<string, string> = {
  LIKERT: 'Escala Likert (1-5)',
  SCALE: 'Escala numérica (personalizada)',
  YES_NO: 'Sim/Não',
  SINGLE_CHOICE: 'Escolha única',
  MULTIPLE_CHOICE: 'Múltipla escolha',
  SHORT_TEXT: 'Texto curto',
  LONG_TEXT: 'Texto longo',
};

/**
 * Modal de criar/editar pergunta, compartilhado entre o editor de perguntas
 * de pesquisa (src/app/admin/surveys/[id]/edit/page.tsx) e o editor de
 * perguntas de modelo (src/app/admin/templates/[id]/edit/page.tsx) — cada um
 * passa seu próprio `onSubmit` (POST de criação ou PATCH de edição, para o
 * endpoint certo), em vez de o modal conhecer a rota.
 */
export function QuestionModal({
  dimensions,
  question,
  onClose,
  onSubmit,
}: {
  dimensions: Dimension[];
  question: EditableQuestion | null;
  onClose: () => void;
  onSubmit: (payload: QuestionSubmitPayload) => Promise<void>;
}) {
  const [text, setText] = useState(question?.text ?? '');
  const [type, setType] = useState(question?.isEnps ? ENPS_OPTION : question?.type ?? 'LIKERT');
  const [dimensionId, setDimensionId] = useState(question?.dimensionId ?? '');
  const [required, setRequired] = useState(question?.required ?? true);
  const [options, setOptions] = useState<string>(question?.options.map((o) => o.label).join('\n') ?? '');
  const [scaleMin, setScaleMin] = useState<string>(question?.scaleMin != null ? String(question.scaleMin) : '1');
  const [scaleMax, setScaleMax] = useState<string>(question?.scaleMax != null ? String(question.scaleMax) : '10');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  const needsOptions = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
  const needsScale = type === 'SCALE';
  const isEnps = type === ENPS_OPTION;

  const mudarTipo = (novo: string) => {
    setType(novo);
    // Enunciado padrão do eNPS: é o texto que permite comparar com outras empresas.
    if (novo === ENPS_OPTION && !text.trim()) setText(ENPS_DEFAULT_TEXT);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: QuestionSubmitPayload = isEnps
        ? { text, type: 'SCALE', dimensionId: dimensionId || null, required, options: [], scaleMin: 0, scaleMax: 10, isEnps: true }
        : {
          text,
          type,
          dimensionId: dimensionId || null,
          required,
          options: needsOptions
            ? options.split('\n').map((l) => l.trim()).filter(Boolean).map((label, order) => ({ label, order }))
            : [],
          scaleMin: needsScale ? Number(scaleMin) : null,
          scaleMax: needsScale ? Number(scaleMax) : null,
          isEnps: false,
        };
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pergunta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab continuava passeando pelo conteudo
          coberto atras dele, incluindo botoes destrutivos. */}
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={question ? 'Editar pergunta' : 'Nova pergunta'}
        className="bg-spot-white rounded-xl2 max-w-lg w-full p-6 flex flex-col gap-4 my-8 modal-panel"
      >
        <h2 className="font-sans text-xl font-extrabold tracking-tight">{question ? 'Editar pergunta' : 'Nova pergunta'}</h2>
        <div>
          <label className="block">
            <span className="label">Texto da pergunta</span>
            <textarea required className="input min-h-[70px]" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block">
              <span className="label">Tipo</span>
              <select className="input" value={type} onChange={(e) => mudarTipo(e.target.value)}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
                <option value={ENPS_OPTION}>eNPS (0 a 10, recomendaria trabalhar aqui?)</option>
              </select>
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">Dimensão</span>
              <select className="input" value={dimensionId} onChange={(e) => setDimensionId(e.target.value)}>
                <option value="">Sem dimensão</option>
                {dimensions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {needsOptions && (
          <div>
            <label className="block">
              <span className="label">Opções (uma por linha)</span>
              <textarea className="input min-h-[100px]" value={options} onChange={(e) => setOptions(e.target.value)} placeholder={'Opção 1\nOpção 2\nOpção 3'} />
            </label>
          </div>
        )}
        {needsScale && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block">
                <span className="label">Valor mínimo</span>
                <input type="number" className="input" value={scaleMin} onChange={(e) => setScaleMin(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Valor máximo</span>
                <input type="number" className="input" value={scaleMax} onChange={(e) => setScaleMax(e.target.value)} />
              </label>
            </div>
          </div>
        )}
        {isEnps && (
          <p className="text-xs text-spot-gray-500 -mt-1">
            Escala de 0 a 10. Nos resultados vira o eNPS: % de quem deu 9–10 menos % de quem deu 0–6. Uma por pesquisa.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-spot-black" />
          Pergunta obrigatória
        </label>
        {error && <p className="text-sm text-spot-danger">{error}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}
