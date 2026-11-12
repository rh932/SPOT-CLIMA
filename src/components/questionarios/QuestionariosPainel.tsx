'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncAction, useAsyncData, useConfirm, useToast,
} from '@/components/async';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import {
  FORM_LABEL, STATUS_LABEL, TYPE_LABEL, canEditQuestion,
  type QuestionAction, type QuestionForm, type QuestionStatus, type QuestionType,
} from '@/lib/questionnaire';
import { FormularioPrevia } from './FormularioPrevia';

export interface PerguntaLinha {
  id: string;
  sectorId: string;
  form: QuestionForm;
  text: string;
  type: QuestionType;
  required: boolean;
  order: number;
  status: QuestionStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  sector: { id: string; name: string } | null;
  createdBy: { name: string } | null;
  reviewedBy: { name: string } | null;
}
export interface SetorQuestionario { id: string; name: string; usesColorCycle: boolean; usesFeedback: boolean }

const SELO: Record<QuestionStatus, string> = {
  RASCUNHO: 'bg-spot-gray-100 text-spot-gray-700',
  EM_ANALISE: 'bg-spot-yellow text-spot-onYellow',
  APROVADA: 'bg-spot-black text-spot-onBlack',
  REPROVADA: 'bg-spot-dangerFill text-white',
  ARQUIVADA: 'bg-spot-gray-100 text-spot-gray-500',
};

const FORMS: QuestionForm[] = ['DESEMPENHO', 'FEEDBACK'];

/**
 * Aba Questionários. O PJ (portal da operação) cria perguntas para o formulário de
 * desempenho e para o de feedback do setor dele e vê a prévia; o RH (painel) vê todos
 * os setores, aprova ou reprova e também pode escrever. A mesma tela serve aos dois —
 * muda o que cada um pode fazer em cada pergunta.
 */
export function QuestionariosPainel({ portal }: { portal: 'admin' | 'gestor' }) {
  const ehRh = portal === 'admin';
  const base = `/api/${portal}/questionnaires`;
  const { data, loading, reloading, error, forbidden, reload } = useAsyncData(
    (signal) => apiFetch<{ questions: PerguntaLinha[]; sectors: SetorQuestionario[] }>(base, { signal }),
    [base],
    { mensagemPadrao: 'Erro ao carregar os questionários.' },
  );
  const perguntas = useMemo(() => data?.questions ?? [], [data]);
  const setores = useMemo(() => data?.sectors ?? [], [data]);
  const acao = useAsyncAction();
  const { mostrar } = useToast();
  const confirmar = useConfirm();

  const [setorEscolhido, setSetorEscolhido] = useState('');
  const [form, setForm] = useState<QuestionForm>('DESEMPENHO');
  const [aba, setAba] = useState<'perguntas' | 'previa'>('perguntas');
  const setor = setores.find((s) => s.id === setorEscolhido) ?? setores[0] ?? null;

  // Nova pergunta
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<QuestionType>('NOTA');
  const [obrigatoria, setObrigatoria] = useState(true);
  const [erroNova, setErroNova] = useState<string | null>(null);
  // Edição e recado de reprovação, por pergunta
  const [editando, setEditando] = useState<string | null>(null);
  const [edTexto, setEdTexto] = useState('');
  const [edTipo, setEdTipo] = useState<QuestionType>('NOTA');
  const [edObrig, setEdObrig] = useState(true);
  const [reprovando, setReprovando] = useState<string | null>(null);
  const [recado, setRecado] = useState('');

  const daVez = perguntas.filter((p) => setor && p.sectorId === setor.id && p.form === form && p.status !== 'ARQUIVADA');
  const arquivadas = perguntas.filter((p) => setor && p.sectorId === setor.id && p.form === form && p.status === 'ARQUIVADA');
  const aguardando = perguntas.filter((p) => p.status === 'EM_ANALISE');
  const contaPorForm = (f: QuestionForm) => perguntas.filter((p) => setor && p.sectorId === setor.id && p.form === f && p.status !== 'ARQUIVADA').length;

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setor) return;
    setErroNova(null);
    const ok = await acao.run(async () => {
      await apiFetch(base, { method: 'POST', body: JSON.stringify({ sectorId: setor.id, form, text: texto, type: tipo, required: obrigatoria }) });
      return true;
    }, 'nova');
    if (!ok) { setErroNova(acao.error ?? null); return; }
    setTexto('');
    mostrar(ehRh ? 'Pergunta publicada.' : 'Pergunta salva como rascunho. Envie ao RH quando estiver pronta.');
    await reload();
  };

  const executar = async (p: PerguntaLinha, a: QuestionAction, note?: string, msg?: string) => {
    const ok = await acao.run(async () => {
      await apiFetch(`${base}/${p.id}`, { method: 'POST', body: JSON.stringify({ action: a, note }) });
      return true;
    }, `${a}:${p.id}`);
    if (!ok) return;
    setReprovando(null);
    setRecado('');
    if (msg) mostrar(msg);
    await reload();
  };

  const arquivar = async (p: PerguntaLinha) => {
    if (!(await confirmar({
      titulo: 'Arquivar esta pergunta?',
      texto: 'Ela sai do formulário daqui para frente. As respostas já dadas continuam no histórico.',
      acao: 'Arquivar',
    }))) return;
    await executar(p, 'ARCHIVE', undefined, 'Pergunta arquivada.');
  };

  const abrirEdicao = (p: PerguntaLinha) => {
    setEditando(p.id); setEdTexto(p.text); setEdTipo(p.type); setEdObrig(p.required);
  };
  const salvarEdicao = async (p: PerguntaLinha) => {
    const aprovada = p.status === 'APROVADA';
    if (aprovada && !ehRh && !(await confirmar({
      titulo: 'Editar uma pergunta que já está no ar?',
      texto: 'Ela volta para a análise do RH e sai do formulário até ser aprovada de novo.',
      acao: 'Editar e reenviar',
    }))) return;
    const ok = await acao.run(async () => {
      await apiFetch(`${base}/${p.id}`, { method: 'PATCH', body: JSON.stringify({ text: edTexto, type: edTipo, required: edObrig }) });
      return true;
    }, `edit:${p.id}`);
    if (!ok) return;
    setEditando(null);
    mostrar(aprovada && !ehRh ? 'Salva. A pergunta voltou para a análise do RH.' : 'Pergunta atualizada.');
    await reload();
  };

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <CabecalhoPagina
        titulo="Questionários"
        subtitulo={ehRh
          ? 'Perguntas que os PJs criam para o formulário de desempenho e o de feedback de cada setor. Nada vai ao ar sem a sua aprovação.'
          : 'Crie perguntas para o formulário de desempenho e o de feedback do seu setor. O RH confere cada uma antes de ela aparecer para quem avalia.'}
      />
      <RefreshingBar visible={reloading} />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="os questionários"
        skeleton={<SkeletonCardList rows={3} comBadge={false} />}
        empty={setores.length === 0}
        emptyState={<EmptyState>Você ainda não tem setor no seu acesso. Peça ao RH para incluir o seu setor.</EmptyState>}
      >
        {/* O RH vê de cara o que espera por ele, de qualquer setor. */}
        {ehRh && aguardando.length > 0 && (
          <section className="card border-l-[3px] border-spot-yellow flex flex-col gap-2" aria-label="Aguardando o RH">
            <p className="font-semibold">{aguardando.length} {aguardando.length === 1 ? 'pergunta aguarda' : 'perguntas aguardam'} a sua decisão</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {aguardando.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="text-left underline decoration-spot-gray-300 underline-offset-2 hover:decoration-spot-black break-words"
                    onClick={() => { setSetorEscolhido(p.sectorId); setForm(p.form); setAba('perguntas'); }}
                  >
                    {p.sector?.name} · {FORM_LABEL[p.form]}: “{p.text}”
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="label">Setor</span>
            <select className="input" value={setor?.id ?? ''} onChange={(e) => { setSetorEscolhido(e.target.value); setEditando(null); }}>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="min-w-0">
            <span className="label">Formulário</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Formulário">
              {FORMS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={form === f}
                  onClick={() => { setForm(f); setEditando(null); }}
                  className={`min-h-11 px-2 rounded-btn border text-sm leading-tight ${form === f ? 'border-spot-gray-900 bg-spot-cream font-semibold' : 'border-spot-gray-300'}`}
                >
                  {f === 'DESEMPENHO' ? 'Desempenho' : 'Feedback'} · {contaPorForm(f)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {setor && form === 'FEEDBACK' && !setor.usesFeedback && !setor.usesColorCycle && (
          <p className="text-sm text-spot-gray-800 bg-spot-white border-l-[3px] border-spot-warning px-3 py-2.5">
            {setor.name} ainda não faz feedback. Você já pode preparar as perguntas, mas elas só aparecem depois que o RH incluir o setor no feedback (em Setores).
          </p>
        )}

        <div className="flex gap-2 border-b border-spot-gray-300" role="tablist" aria-label="Perguntas ou prévia">
          {([['perguntas', 'Perguntas'], ['previa', 'Ver como fica']] as const).map(([k, rot]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={aba === k}
              onClick={() => setAba(k)}
              className={`min-h-11 px-3 text-sm -mb-px border-b-2 ${aba === k ? 'border-spot-gray-900 font-semibold' : 'border-transparent text-spot-gray-500'}`}
            >
              {rot}
            </button>
          ))}
        </div>

        {aba === 'previa' && setor && (
          <FormularioPrevia
            setor={setor}
            form={form}
            perguntas={perguntas.filter((p) => p.sectorId === setor.id && p.form === form && ['APROVADA', 'EM_ANALISE', 'RASCUNHO'].includes(p.status))}
          />
        )}

        {aba === 'perguntas' && setor && (
          <>
            <form onSubmit={criar} className="card flex flex-col gap-3">
              <p className="font-semibold">Nova pergunta · {setor.name} · {FORM_LABEL[form]}</p>
              <label className="block">
                <span className="label">Pergunta</span>
                <textarea
                  className="input min-h-[80px] resize-y"
                  maxLength={300}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: O colaborador segue o padrão de apresentação da praça?"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className="label">Como se responde</span>
                  <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as QuestionType)}>
                    {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2.5 min-h-11 self-end">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
                  <span className="text-sm">Resposta obrigatória</span>
                </label>
              </div>
              {erroNova && <p role="alert" className="text-sm text-spot-danger">{erroNova}</p>}
              <ActionButton
                type="submit"
                className="btn-primary w-full sm:w-auto sm:self-start"
                pending={acao.isPending('nova')}
                pendingLabel="Salvando..."
                disabled={texto.trim().length < 5}
              >
                {ehRh ? 'Criar e publicar' : 'Salvar como rascunho'}
              </ActionButton>
            </form>

            {daVez.length === 0
              ? <EmptyState>Nenhuma pergunta extra neste formulário. O formulário padrão continua valendo.</EmptyState>
              : (
                <ul className="flex flex-col gap-3">
                  {daVez.map((p) => {
                    const podeEditar = canEditQuestion(p.status, { isReviewer: ehRh });
                    const pend = (a: string) => acao.isPending(`${a}:${p.id}`);
                    return (
                      <li key={p.id} className="card flex flex-col gap-3 min-w-0">
                        {editando === p.id ? (
                          <div className="flex flex-col gap-3">
                            <textarea className="input min-h-[80px] resize-y" maxLength={300} value={edTexto} onChange={(e) => setEdTexto(e.target.value)} aria-label="Texto da pergunta" />
                            <select className="input" value={edTipo} onChange={(e) => setEdTipo(e.target.value as QuestionType)} aria-label="Como se responde">
                              {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                            </select>
                            <label className="flex items-center gap-2.5 min-h-11">
                              <input type="checkbox" className="h-5 w-5 shrink-0" checked={edObrig} onChange={(e) => setEdObrig(e.target.checked)} />
                              <span className="text-sm">Resposta obrigatória</span>
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <ActionButton className="btn-primary" pending={acao.isPending(`edit:${p.id}`)} pendingLabel="Salvando..." disabled={edTexto.trim().length < 5} onClick={() => salvarEdicao(p)}>Salvar</ActionButton>
                              <button type="button" className="btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <p className="font-medium break-words min-w-0 flex-1 basis-56">{p.text}</p>
                              <span className={`badge ${SELO[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                            </div>
                            <p className="text-xs text-spot-gray-600 break-words">
                              {TYPE_LABEL[p.type]} · {p.required ? 'obrigatória' : 'opcional'}
                              {p.createdBy ? ` · criada por ${p.createdBy.name}` : ''}
                              {p.reviewedBy && p.status !== 'EM_ANALISE' && p.status !== 'RASCUNHO' ? ` · decidida por ${p.reviewedBy.name}` : ''}
                            </p>
                            {p.reviewNote && p.status === 'REPROVADA' && (
                              <p className="text-sm border-l-[3px] border-spot-danger pl-3 break-words">
                                <span className="font-semibold">Recado do RH:</span> {p.reviewNote}
                              </p>
                            )}
                          </>
                        )}

                        {editando !== p.id && (
                          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                            {!ehRh && (p.status === 'RASCUNHO' || p.status === 'REPROVADA') && (
                              <ActionButton className="btn-primary" pending={pend('SUBMIT')} pendingLabel="Enviando..." onClick={() => executar(p, 'SUBMIT', undefined, 'Enviada para o RH.')}>
                                {p.status === 'REPROVADA' ? 'Reenviar ao RH' : 'Enviar ao RH'}
                              </ActionButton>
                            )}
                            {!ehRh && p.status === 'EM_ANALISE' && (
                              <ActionButton className="btn-ghost" pending={pend('WITHDRAW')} pendingLabel="Retirando..." onClick={() => executar(p, 'WITHDRAW', undefined, 'Pergunta retirada da análise.')}>Retirar da análise</ActionButton>
                            )}
                            {ehRh && (p.status === 'EM_ANALISE' || p.status === 'REPROVADA') && (
                              <ActionButton className="btn-primary" pending={pend('APPROVE')} pendingLabel="Aprovando..." onClick={() => executar(p, 'APPROVE', undefined, 'Pergunta aprovada. Já aparece no formulário.')}>Aprovar</ActionButton>
                            )}
                            {ehRh && (p.status === 'EM_ANALISE' || p.status === 'APROVADA') && reprovando !== p.id && (
                              <button type="button" className="btn-ghost" onClick={() => { setReprovando(p.id); setRecado(''); }}>
                                {p.status === 'APROVADA' ? 'Tirar do ar' : 'Reprovar'}
                              </button>
                            )}
                            {podeEditar && <button type="button" className="btn-ghost" onClick={() => abrirEdicao(p)}>Editar</button>}
                            {(ehRh || p.status === 'RASCUNHO' || p.status === 'REPROVADA') && (
                              <ActionButton className="btn-ghost text-spot-danger" pending={pend('ARCHIVE')} onClick={() => arquivar(p)}>Arquivar</ActionButton>
                            )}
                          </div>
                        )}

                        {reprovando === p.id && (
                          <div className="flex flex-col gap-2">
                            <label className="block">
                              <span className="label">Recado para o PJ (obrigatório)</span>
                              <textarea className="input min-h-[70px] resize-y" maxLength={500} value={recado} onChange={(e) => setRecado(e.target.value)} placeholder="O que precisa mudar?" />
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <ActionButton className="btn-primary" pending={pend('REJECT')} pendingLabel="Salvando..." disabled={!recado.trim()} onClick={() => executar(p, 'REJECT', recado, 'Pergunta devolvida com o seu recado.')}>Confirmar</ActionButton>
                              <button type="button" className="btn-ghost" onClick={() => setReprovando(null)}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

            {acao.error && !erroNova && <p role="alert" className="text-sm text-spot-danger">{acao.error}</p>}

            {arquivadas.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer min-h-11 flex items-center text-spot-gray-600">Arquivadas · {arquivadas.length}</summary>
                <ul className="flex flex-col gap-1.5 mt-1 text-spot-gray-500">
                  {arquivadas.map((p) => <li key={p.id} className="break-words">“{p.text}”</li>)}
                </ul>
              </details>
            )}
          </>
        )}
      </AsyncSection>
    </div>
  );
}
