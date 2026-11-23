'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ic } from '@/components/sp/Ic';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { SlideEnviar } from '@/components/gestor/AvaliacaoPassos';
import { buzz, pick, shake, sound, sweep } from '@/lib/motion';
import type { AnswerValue, QuestionData } from './QuestionField';

/*
 * Pesquisa de clima, UMA PERGUNTA POR TELA (padrão Spot Integra).
 *
 * Só apresentação e navegação. Quem guarda as respostas, valida e envia é a
 * página (survey/page.tsx), sem mudança nas perguntas, na ordem, na
 * obrigatoriedade nem no corpo do envio. Nada aqui identifica a pessoa:
 * nenhum nome, e-mail, ID novo ou medição por pessoa, e nada é guardado no
 * aparelho (a pesquisa nunca teve rascunho e continua sem).
 */

export type QuestaoDaPesquisa = QuestionData & { dimension: { id: string; name: string; order: number } | null };

const LIKERT = [
  { value: 1, label: 'Muito em desacordo' },
  { value: 2, label: 'Em desacordo' },
  { value: 3, label: 'Nem de acordo nem em desacordo' },
  { value: 4, label: 'De acordo' },
  { value: 5, label: 'Totalmente de acordo' },
];

/** Segundos que uma pergunta leva, em média, para quem tem pouca prática. */
const SEG_POR_PERGUNTA = 20;
export const minutosEstimados = (perguntas: number) => Math.max(1, Math.round((perguntas * SEG_POR_PERGUNTA) / 60));

export const respondida = (v: AnswerValue | undefined): boolean => {
  if (!v) return false;
  if (v.numericValue !== undefined) return true;
  if (v.choiceValues && v.choiceValues.length > 0) return true;
  return Boolean(v.textValue && v.textValue.trim().length > 0);
};

/** A resposta em palavras, para a revisão. */
function textoDaResposta(q: QuestaoDaPesquisa, v: AnswerValue | undefined): string {
  if (!respondida(v)) return '';
  if (v!.numericValue !== undefined) {
    if (q.type === 'LIKERT') return `${v!.numericValue} · ${LIKERT.find((l) => l.value === v!.numericValue)?.label ?? ''}`;
    return String(v!.numericValue);
  }
  if (v!.choiceValues?.length) return v!.choiceValues.join(', ');
  return v!.textValue ?? '';
}

type Tela =
  | { k: 'pergunta'; q: QuestaoDaPesquisa; bloco: number }
  | { k: 'bloco'; bloco: number }
  | { k: 'revisao' };

export function PesquisaPassos(p: {
  questoes: QuestaoDaPesquisa[];
  respostas: Record<string, AnswerValue>;
  onResponder: (id: string, v: AnswerValue) => void;
  /** Voltar da primeira pergunta. */
  onVoltarInicio: () => void;
  /** Sair da pesquisa (volta ao começo; as respostas não ficam guardadas). */
  onSair: () => void;
  enviando: boolean;
  erroEnvio: string | null;
  onEnviar: () => void;
}) {
  // Blocos = dimensões, na mesma ordem de antes.
  const blocos = useMemo(() => {
    const map = new Map<string, { nome: string; ordem: number; qs: QuestaoDaPesquisa[] }>();
    for (const q of p.questoes) {
      const chave = q.dimension?.id ?? 'sem-dimensao';
      const e = map.get(chave) ?? { nome: q.dimension?.name ?? 'Outras perguntas', ordem: q.dimension?.order ?? 999, qs: [] };
      e.qs.push(q);
      map.set(chave, e);
    }
    return Array.from(map.values()).sort((a, b) => a.ordem - b.ordem);
  }, [p.questoes]);

  const telas = useMemo<Tela[]>(() => {
    const t: Tela[] = [];
    blocos.forEach((b, bi) => {
      b.qs.forEach((q) => t.push({ k: 'pergunta', q, bloco: bi }));
      if (bi < blocos.length - 1) t.push({ k: 'bloco', bloco: bi });
    });
    t.push({ k: 'revisao' });
    return t;
  }, [blocos]);

  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [tentou, setTentou] = useState(false);
  const [sairAberto, setSairAberto] = useState(false);
  const [rvAberto, setRvAberto] = useState(0);
  const palcoRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sairRef = usePainelModal<HTMLElement>({ aberto: sairAberto, aoFechar: () => setSairAberto(false) });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const atual = telas[Math.min(i, telas.length - 1)];
  const total = p.questoes.length;
  const numeroDe = (q: QuestaoDaPesquisa) => p.questoes.findIndex((x) => x.id === q.id) + 1;
  const blocoAtual = atual.k === 'revisao' ? blocos.length : atual.bloco;

  // Foco no enunciado: quem usa leitor de tela ouve a pergunta nova.
  useEffect(() => {
    palcoRef.current?.querySelector<HTMLElement>('[data-foco]')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [i]);

  const ir = (n: number, via: 'fila' | 'barra' = 'fila') => {
    if (timer.current) clearTimeout(timer.current);
    const alvo = Math.max(0, Math.min(n, telas.length - 1));
    setDir(alvo >= i ? 1 : -1);
    setTentou(false);
    const t = telas[alvo];
    const troca = t.k === 'revisao' || t.k === 'bloco' || (atual.k === 'bloco' && t.k === 'pergunta');
    if (via === 'barra' && troca) void sweep(() => setI(alvo), { dir: alvo >= i ? 1 : -1, text: t.k === 'revisao' ? 'Revisão' : undefined });
    else setI(alvo);
  };
  const voltar = () => {
    if (i === 0) { p.onVoltarInicio(); return; }
    ir(i - 1);
  };

  const marcar = (el: HTMLElement | null, v: AnswerValue, avancar: boolean, q: QuestaoDaPesquisa) => {
    p.onResponder(q.id, v);
    pick(el);
    buzz(10);
    sound('tick');
    if (avancar) {
      if (timer.current) clearTimeout(timer.current);
      // Avança sozinho depois de 380 ms, o tempo de ver a escolha.
      timer.current = setTimeout(() => ir(i + 1), 380);
    }
  };

  const continuar = (q: QuestaoDaPesquisa) => {
    if (q.required && !respondida(p.respostas[q.id])) {
      setTentou(true);
      shake(palcoRef.current);
      sound('bad');
      buzz([30, 40, 30]);
      return;
    }
    sound('ok');
    ir(i + 1);
  };

  const feitas = p.questoes.filter((q) => respondida(p.respostas[q.id])).length;
  const jaPassaram = telas.slice(0, i).filter((t) => t.k === 'pergunta').length;
  const restantes = total - jaPassaram;
  const minutosRestantes = Math.max(1, Math.round((Math.max(0, restantes) * SEG_POR_PERGUNTA) / 60));

  const aviso = tentou && <p className="miss" role="alert"><Ic n="info" s={16} /> Falta responder esta pergunta</p>;
  const botaoVoltar = <button type="button" className="back-q" onClick={voltar}>Voltar para a anterior</button>;

  // ─── telas ───
  let palco: ReactNode;
  if (atual.k === 'pergunta') {
    const q = atual.q;
    const v = p.respostas[q.id];
    const n = numeroDe(q);
    const enunciado = (
      <div className="qcard">
        <span className="A">{blocos[atual.bloco].nome}</span>
        <p tabIndex={-1} data-foco id={`q-${q.id}`}>
          {q.text}
          {q.required ? <span className="sr"> (obrigatória)</span> : <span className="opc"> (opcional)</span>}
        </p>
      </div>
    );
    let respostaUI: ReactNode;
    let precisaContinuar = false;

    if (q.type === 'LIKERT') {
      respostaUI = (
        <div className="answers answers-col" role="radiogroup" aria-labelledby={`q-${q.id}`}>
          {LIKERT.map((o, k) => (
            <button key={o.value} type="button" role="radio" aria-checked={v?.numericValue === o.value} className="ans mk-opt" style={{ ['--n' as string]: k }}
              onClick={(e) => marcar(e.currentTarget, { numericValue: o.value }, true, q)}>
              <span className="k k-num">{o.value}</span>{o.label}
            </button>
          ))}
        </div>
      );
    } else if (q.type === 'SCALE' && q.scaleMin != null && q.scaleMax != null) {
      const nums = Array.from({ length: q.scaleMax - q.scaleMin + 1 }, (_, k) => (q.scaleMin as number) + k);
      respostaUI = (
        <div role="radiogroup" aria-labelledby={`q-${q.id}`}>
          <div className={`escala ${nums.length === 11 ? 'escala-11' : ''}`}>
            {nums.map((x, k) => (
              <button key={x} type="button" role="radio" aria-checked={v?.numericValue === x} className="esc mk-opt" style={{ ['--n' as string]: Math.min(k, 8) }}
                onClick={(e) => marcar(e.currentTarget, { numericValue: x }, true, q)}>
                <span aria-hidden>{x}</span>
                <span className="sr">Nota {x} de {q.scaleMax}</span>
              </button>
            ))}
          </div>
          {q.isEnps && (
            <p className="escala-pontas" aria-hidden="true"><span>0 = nada provável</span><span>10 = muito provável</span></p>
          )}
        </div>
      );
    } else if (q.type === 'YES_NO') {
      respostaUI = (
        <div className="grades grades-2" role="radiogroup" aria-labelledby={`q-${q.id}`}>
          {([['Sim', 'check'], ['Não', 'x']] as const).map(([rot, ic], k) => (
            <button key={rot} type="button" role="radio" aria-checked={v?.choiceValues?.[0] === rot} className="gr mk-opt" style={{ ['--n' as string]: k }}
              onClick={(e) => marcar(e.currentTarget, { choiceValues: [rot] }, true, q)}>
              <Ic n={ic} s={30} w={2.4} /><span>{rot}</span>
            </button>
          ))}
        </div>
      );
    } else if (q.type === 'SINGLE_CHOICE') {
      respostaUI = (
        <div className="pass-opts" role="radiogroup" aria-labelledby={`q-${q.id}`}>
          {q.options.map((o, k) => (
            <button key={o.id} type="button" role="radio" aria-checked={v?.choiceValues?.[0] === o.label} className="opt mk-opt" style={{ ['--n' as string]: Math.min(k, 8) }}
              onClick={(e) => marcar(e.currentTarget, { choiceValues: [o.label] }, true, q)}>
              <span className="d"><Ic n="check" s={14} w={3.2} /></span>{o.label}
            </button>
          ))}
        </div>
      );
    } else if (q.type === 'MULTIPLE_CHOICE') {
      precisaContinuar = true;
      respostaUI = (
        <div className="pass-opts" role="group" aria-labelledby={`q-${q.id}`}>
          {q.options.map((o, k) => {
            const on = v?.choiceValues?.includes(o.label) ?? false;
            return (
              <button key={o.id} type="button" role="checkbox" aria-checked={on} className="opt opt-multi mk-opt" style={{ ['--n' as string]: Math.min(k, 8) }}
                onClick={(e) => {
                  const atualV = v?.choiceValues ?? [];
                  marcar(e.currentTarget, { choiceValues: on ? atualV.filter((x) => x !== o.label) : [...atualV, o.label] }, false, q);
                }}>
                <span className="d"><Ic n="check" s={14} w={3.2} /></span>{o.label}
              </button>
            );
          })}
          <p className="mut" style={{ fontSize: 15 }}>Pode marcar mais de uma.</p>
        </div>
      );
    } else {
      precisaContinuar = true;
      const longo = q.type === 'LONG_TEXT';
      const max = longo ? 2000 : 300;
      const texto = v?.textValue ?? '';
      respostaUI = (
        <div className="texto-livre">
          <label htmlFor={`t-${q.id}`} className="sr">{q.text}</label>
          <textarea
            id={`t-${q.id}`}
            className={`input pass-area ${tentou && q.required && !texto.trim() ? 'bad' : ''}`}
            maxLength={max}
            rows={longo ? 6 : 3}
            value={texto}
            onChange={(e) => p.onResponder(q.id, { textValue: e.target.value })}
            placeholder={q.required ? 'Escreva aqui' : 'Escreva aqui (opcional)'}
            aria-invalid={tentou && q.required && !texto.trim() ? true : undefined}
          />
          <p className="texto-cont" aria-hidden="true">{texto.length} / {max}</p>
          <p className="texto-aviso"><Ic n="lock" s={16} /> Não escreva nomes, para manter o anonimato.</p>
        </div>
      );
    }

    palco = (
      <div className="stage swap-in" style={{ ['--dir' as string]: dir }}>
        <div className="qcount">
          <span className="kick">Pergunta {n} de {total}</span>
        </div>
        {enunciado}
        {respostaUI}
        {aviso}
        <div className="pass-acoes pass-acoes-lin">
          {botaoVoltar}
          {precisaContinuar && (
            <button type="button" className="btn btn-ink press" onClick={() => continuar(q)}>
              {!q.required && !respondida(v) ? 'Pular' : 'Continuar'} <Ic n="arrow" s={18} w={2.2} className="arr" />
            </button>
          )}
          {!precisaContinuar && respondida(v) && (
            <button type="button" className="btn btn-ink press" onClick={() => continuar(q)}>Continuar <Ic n="arrow" s={18} w={2.2} className="arr" /></button>
          )}
          {!precisaContinuar && !respondida(v) && !q.required && (
            <button type="button" className="btn btn-ghost press" onClick={() => continuar(q)}>Pular</button>
          )}
        </div>
      </div>
    );
  } else if (atual.k === 'bloco') {
    const b = blocos[atual.bloco];
    palco = (
      <div className="stage swap-in" style={{ ['--dir' as string]: dir }}>
        <div className="stepdone">
          <span className="seal-s mk-stamp"><Ic n="check" s={40} w={3} /></span>
          <span className="kick" style={{ marginTop: 22 }}>Bloco {atual.bloco + 1} de {blocos.length} concluído</span>
          <h1 className="H" tabIndex={-1} data-foco style={{ fontSize: 30, marginTop: 8 }}>{b.nome}</h1>
          <p className="mut" style={{ marginTop: 10 }}>Falta{blocos.length - atual.bloco - 1 === 1 ? '' : 'm'} {blocos.length - atual.bloco - 1} {blocos.length - atual.bloco - 1 === 1 ? 'bloco' : 'blocos'}.</p>
        </div>
        <button type="button" className="btn btn-ink btn-block press" style={{ minHeight: 58 }} onClick={() => { sound('ok'); ir(i + 1, 'barra'); }}>
          Próximo bloco <Ic n="arrow" s={20} w={2.2} className="arr" />
        </button>
        {botaoVoltar}
      </div>
    );
  } else {
    const faltam = p.questoes.filter((q) => q.required && !respondida(p.respostas[q.id]));
    palco = (
      <div className="stage-rev swap-in" style={{ ['--dir' as string]: dir }}>
        <div className="review">
          <div className="vbox">
            <span className="seal-s" aria-hidden="true"><Ic n="send" s={34} w={2.2} /></span>
            <h1 className="H" tabIndex={-1} data-foco style={{ fontSize: 30, marginTop: 14 }}>Pronto para enviar?</h1>
            <p className="mut" style={{ marginTop: 8 }}>
              Você respondeu {feitas} de {total} perguntas. As respostas são anônimas e não podem ser mudadas depois do envio.
            </p>
            <div className="slide-wrap">
              {faltam.length > 0 && (
                <p className="miss" role="alert" style={{ marginBottom: 10 }}>
                  <Ic n="info" s={16} /> Falta responder {faltam.length === 1 ? '1 pergunta obrigatória' : `${faltam.length} perguntas obrigatórias`}.
                </p>
              )}
              {p.erroEnvio && <p className="miss" role="alert" style={{ marginBottom: 10 }}><Ic n="info" s={16} /> {p.erroEnvio} As suas respostas continuam aqui: pode tentar de novo.</p>}
              <SlideEnviar
                desabilitado={p.enviando}
                onEnviar={() => {
                  const k = telas.findIndex((t) => t.k === 'pergunta' && t.q.required && !respondida(p.respostas[t.q.id]));
                  if (k >= 0) { sound('bad'); buzz([30, 40, 30]); ir(k, 'barra'); setTimeout(() => setTentou(true), 450); return; }
                  buzz(12);
                  p.onEnviar();
                }}
              />
            </div>
          </div>
          <div>
            <div className="sechead" style={{ marginTop: 0 }}><h2 className="H">Suas respostas</h2><span className="ln" /></div>
            <div className="rvlist">
              {blocos.map((b, k) => (
                <div key={b.nome} className="rv" data-open={rvAberto === k ? '' : undefined}>
                  <button type="button" onClick={() => setRvAberto(rvAberto === k ? -1 : k)} aria-expanded={rvAberto === k}>
                    <span className="n">{k + 1}</span>
                    <span className="t"><b>{b.nome}</b><small>{b.qs.filter((q) => respondida(p.respostas[q.id])).length} de {b.qs.length} respondidas</small></span>
                    <Ic n="down" s={18} className="chev" />
                  </button>
                  {rvAberto === k && (
                    <dl>
                      {b.qs.map((q) => (
                        <div key={q.id}>
                          <dt>{q.text}</dt>
                          <dd>{textoDaResposta(q, p.respostas[q.id]) || 'Sem resposta'}</dd>
                          <button type="button" className="link" style={{ justifySelf: 'start', minHeight: 44 }}
                            onClick={() => { const n = telas.findIndex((t) => t.k === 'pergunta' && t.q.id === q.id); if (n >= 0) ir(n, 'barra'); }}>
                            Corrigir
                          </button>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ))}
            </div>
            <p className="mut slide-nota-m">As respostas entram junto com as da equipe, sem o seu nome.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flow pesquisa-flow">
      <header className="fhead">
        <div className="r">
          <button type="button" className="btn btn-ghost btn-sair-p" onClick={() => setSairAberto(true)} aria-label="Sair da pesquisa">Sair</button>
          <div
            className="segs segs-n"
            style={{ ['--n' as string]: blocos.length }}
            role="progressbar"
            aria-label="Progresso da pesquisa"
            aria-valuemin={0}
            aria-valuemax={blocos.length}
            aria-valuenow={Math.min(blocoAtual, blocos.length)}
            aria-valuetext={atual.k === 'revisao' ? 'Revisão' : `Bloco ${blocoAtual + 1} de ${blocos.length}: ${blocos[blocoAtual]?.nome ?? ''}`}
          >
            {blocos.map((b, k) => {
              const qs = b.qs.length;
              const feitasB = b.qs.filter((q) => respondida(p.respostas[q.id])).length;
              const cheio = k < blocoAtual || atual.k === 'revisao';
              return <span key={b.nome} className={cheio ? 'is-done' : ''}><i style={{ width: cheio ? '100%' : k === blocoAtual ? `${Math.max(8, Math.round((feitasB / qs) * 100))}%` : '0%' }} /></span>;
            })}
          </div>
          {atual.k === 'pergunta' && <span className="saved contador-p"><b>Pergunta {numeroDe(atual.q)} de {total}</b></span>}
        </div>
      </header>
      <div className="fgrid">
        <nav className="rail" aria-label="Blocos da pesquisa">
          {blocos.map((b, k) => {
            const estado = atual.k === 'revisao' || k < blocoAtual ? 'past' : k === blocoAtual ? 'now' : '';
            return (
              <div key={b.nome} className={`st ${estado}`} aria-current={estado === 'now' ? 'step' : undefined}>
                <span className="b">{estado === 'past' ? <Ic n="check" s={13} w={3} /> : k + 1}</span>
                <span className="st-t">{b.nome}</span>
              </div>
            );
          })}
          <div className={`st ${atual.k === 'revisao' ? 'now' : ''}`}><span className="b">R</span><span className="st-t">Revisão</span></div>
        </nav>
        <div ref={palcoRef} className="stage-box" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>{palco}</div>
        <aside className="aside-r" aria-label="Sobre esta pesquisa">
          <span className="kick">Sobre esta pesquisa</span>
          <div className="card sobre">
            <p className="sobre-t"><Ic n="lock" s={18} /> <b>Anônima</b></p>
            <p className="mut">Não pedimos seu nome. O RH vê só os resultados do grupo.</p>
          </div>
          <div className="card sobre">
            <p className="sobre-t"><Ic n="clock" s={18} /> <b>{atual.k === 'revisao' ? 'Quase lá' : `Cerca de ${minutosRestantes} min restantes`}</b></p>
            <p className="mut">Uma pergunta por vez. Pode voltar para a anterior quando quiser.</p>
          </div>
          <div className="card sobre">
            <p className="sobre-t"><Ic n="info" s={18} /> <b>Uma dica</b></p>
            <p className="mut">Responda pensando nos últimos meses.</p>
          </div>
        </aside>
      </div>

      {sairAberto && (
        <>
          <div className="sheet-bd" onClick={() => setSairAberto(false)} aria-hidden="true" />
          <section ref={sairRef} className="sheet" role="dialog" aria-modal="true" aria-label="Sair da pesquisa">
            <span className="grab" aria-hidden="true" />
            <h2 className="H" style={{ fontSize: 24 }}>Sair da pesquisa?</h2>
            <p className="mut" style={{ margin: '8px 0 18px' }}>Se sair agora, as respostas desta pesquisa não ficam guardadas e você começa de novo quando voltar.</p>
            <button type="button" className="btn btn-ink btn-block press" onClick={() => setSairAberto(false)}>Continuar respondendo</button>
            <button type="button" className="btn btn-ghost btn-block press" style={{ marginTop: 8 }} onClick={p.onSair}>Sair da pesquisa</button>
          </section>
        </>
      )}

      {p.enviando && (
        <>
          <div className="sheet-bd" aria-hidden="true" />
          <section className="sending" role="status">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <b style={{ fontSize: 20 }}>Enviando…</b>
              <span className="spin" aria-hidden="true" />
            </div>
            <p className="mut" style={{ marginTop: 10 }}>Aguarde um instante.</p>
          </section>
        </>
      )}
    </div>
  );
}
