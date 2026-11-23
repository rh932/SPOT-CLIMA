'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Ic, type NomeIcone } from '@/components/sp/Ic';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { buzz, pick, shake, sound, sweep } from '@/lib/motion';
import {
  RATING_OPTIONS, RATING_LABELS, SUB_ANSWER_LABELS,
  type EvaluationDimension, type RatingOption, type SubAnswerOption,
} from '@/data/evaluationBank';

/*
 * Ficha de avaliação, UMA PERGUNTA POR VEZ (padrão Spot Integra).
 *
 * Este componente só cuida da APRESENTAÇÃO e da navegação entre as telas. Quem
 * guarda as respostas, valida, salva o rascunho no aparelho e envia para a API
 * continua sendo a página de avaliação (evaluate/page.tsx), sem nenhuma
 * mudança nas perguntas, nas regras ou no corpo do envio.
 *
 * Telas, em ordem: data → (nota geral + cada frase de cada dimensão, com um
 * resumo ao fim de cada etapa) → telas "livres" que a página monta (roteiro,
 * uniforme, perguntas do setor, textos, classificação, conclusão, cor...) →
 * revisão com "deslizar para enviar".
 */

const ICONE_NOTA: Record<RatingOption, NomeIcone> = { OTIMO: 'star', BOM: 'smile', REGULAR: 'meh', RUIM: 'frown' };
const LETRAS = 'ABCDEF';

/** Tela livre, montada pela página com o conteúdo que ela já tinha. */
export interface PassoLivre {
  id: string;
  /** Agrupa telas numa mesma etapa da trilha. */
  grupo: string;
  /** Linha em mono acima do título. */
  kick: string;
  titulo: string;
  descricao?: string;
  node: ReactNode;
  /** Tudo o que é obrigatório nesta tela está respondido. */
  completo: boolean;
  /** Pode seguir sem responder. */
  opcional?: boolean;
  /** Linhas da revisão. */
  resumo: [string, string][];
}

type Tela =
  | { k: 'data'; grupo: string }
  | { k: 'nota'; d: number; grupo: string }
  | { k: 'sub'; d: number; q: number; grupo: string }
  | { k: 'resumo'; d: number; grupo: string }
  | { k: 'livre'; p: number; grupo: string }
  | { k: 'revisao'; grupo: string };

export interface AvaliacaoPassosProps {
  nome: string;
  primeiroNome: string;
  /** Ex.: "Garçom · Salão · Consolação". */
  cargoLinha: string;
  /** Ex.: "2º ciclo de experiência (90 dias)". */
  periodoLabel: string;
  /** Ex.: "vencimento 19/11/2026". */
  prazoTexto: string;
  dimensoes: EvaluationDimension[];
  ratings: Record<string, RatingOption | null>;
  subAnswers: Record<string, Record<string, SubAnswerOption | null>>;
  onRating: (dim: string, v: RatingOption) => void;
  onSub: (dim: string, key: string, v: SubAnswerOption) => void;
  evaluationDate: string;
  onDate: (v: string) => void;
  dataMin?: string;
  dataMax: string;
  passos: PassoLivre[];
  /** Avisos da primeira tela (rascunho retomado, segunda resposta, feedbacks anteriores). */
  avisos?: ReactNode;
  /** Um rascunho acabou de ser restaurado: vai para a primeira tela incompleta. */
  restaurado: boolean;
  /** O que aparece em destaque na revisão. */
  veredito: { rotulo: string; valor: string; selo?: string };
  enviando: boolean;
  erroEnvio: string | null;
  onEnviar: () => void;
  /** A pessoa tentou seguir com algo obrigatório em branco: a página passa a mostrar os erros dos campos. */
  onTentou?: () => void;
  onSair: () => void;
}

export function AvaliacaoPassos(p: AvaliacaoPassosProps) {
  const { dimensoes: dims } = p;

  // ── lista de telas (recalculada quando a página muda as telas livres) ──
  const telas = useMemo<Tela[]>(() => {
    // A data não é uma etapa à parte na trilha: fica junto da primeira etapa.
    const t: Tela[] = [{ k: 'data', grupo: dims[0]?.name ?? p.passos[0]?.grupo ?? 'Revisão' }];
    dims.forEach((d, di) => {
      t.push({ k: 'nota', d: di, grupo: d.name });
      d.subQuestions.forEach((_, qi) => t.push({ k: 'sub', d: di, q: qi, grupo: d.name }));
      t.push({ k: 'resumo', d: di, grupo: d.name });
    });
    p.passos.forEach((s, si) => t.push({ k: 'livre', p: si, grupo: s.grupo }));
    t.push({ k: 'revisao', grupo: 'Revisão' });
    return t;
  }, [dims, p.passos]);

  const etapas = useMemo(() => [...new Set(telas.filter((x) => x.k !== 'revisao').map((x) => x.grupo))], [telas]);

  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [tentou, setTentou] = useState(false);
  const [sairAberto, setSairAberto] = useState(false);
  const [rvAberto, setRvAberto] = useState(0);
  const palcoRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sairRef = usePainelModal<HTMLElement>({ aberto: sairAberto, aoFechar: () => setSairAberto(false) });
  const topoRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const atual = telas[Math.min(i, telas.length - 1)];

  // ── o que está completo em cada tela ──
  const completa = useCallback(
    (t: Tela): boolean => {
      if (t.k === 'data') return Boolean(p.evaluationDate);
      if (t.k === 'nota') return Boolean(p.ratings[dims[t.d].key]);
      if (t.k === 'sub') return Boolean(p.subAnswers[dims[t.d].key]?.[dims[t.d].subQuestions[t.q].key]);
      if (t.k === 'livre') return p.passos[t.p].completo || Boolean(p.passos[t.p].opcional);
      return true;
    },
    [dims, p.evaluationDate, p.passos, p.ratings, p.subAnswers],
  );
  const primeiraIncompleta = useCallback(() => telas.findIndex((t) => !completa(t)), [telas, completa]);

  // Rascunho retomado: abre onde a pessoa parou.
  const jaRestaurou = useRef(false);
  useEffect(() => {
    if (!p.restaurado || jaRestaurou.current) return;
    jaRestaurou.current = true;
    const n = primeiraIncompleta();
    setI(n < 0 ? telas.length - 1 : n);
  }, [p.restaurado, primeiraIncompleta, telas.length]);

  // Foco no título da tela nova: quem usa leitor de tela ouve a pergunta.
  useEffect(() => {
    palcoRef.current?.querySelector<HTMLElement>('[data-foco]')?.focus({ preventScroll: true });
    topoRef.current?.scrollIntoView?.({ block: 'start' });
  }, [i]);

  const ir = useCallback(
    (n: number, via: 'fila' | 'barra' = 'fila') => {
      if (timer.current) clearTimeout(timer.current);
      const alvo = Math.max(0, Math.min(n, telas.length - 1));
      setDir(alvo >= i ? 1 : -1);
      setTentou(false);
      const trocar = () => setI(alvo);
      const grupoMudou = telas[alvo].grupo !== telas[i]?.grupo;
      // Troca de etapa: faixa âmbar. Dentro da etapa: só a tela nova entrando.
      if (via === 'barra' && grupoMudou) void sweep(trocar, { dir: alvo >= i ? 1 : -1, text: telas[alvo].grupo === 'Revisão' ? 'Revisão' : undefined });
      else trocar();
    },
    [i, telas],
  );

  const responder = (el: HTMLElement, marcar: () => void) => {
    marcar();
    pick(el);
    buzz(10);
    sound('tick');
    // Avança sozinho depois de 380 ms, o tempo de ver a escolha.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ir(i + 1), 380);
  };

  const continuar = (t: Tela) => {
    if (!completa(t)) {
      setTentou(true);
      p.onTentou?.();
      shake(palcoRef.current);
      sound('bad');
      buzz([30, 40, 30]);
      return;
    }
    sound('ok');
    ir(i + 1, t.k === 'resumo' || t.k === 'livre' ? 'barra' : 'fila');
  };

  // ── progresso ──
  const perguntas = telas.filter((t) => t.k !== 'resumo' && t.k !== 'revisao');
  const numeroDaPergunta = perguntas.findIndex((t) => t === atual) + 1;
  const etapaAtual = etapas.indexOf(atual.grupo);
  const fracEtapa = (g: string) => {
    const doGrupo = perguntas.filter((t) => t.grupo === g);
    const feitas = doGrupo.filter((t) => completa(t) && telas.indexOf(t) < i).length;
    return doGrupo.length ? Math.round((feitas / doGrupo.length) * 100) : 0;
  };
  const rotuloCurto = (g: string) => g.split(' ')[0];

  // ── cabeçalho (barra segmentada, contador e sair) ──
  const cabecalho = (
    <header className="fhead">
      <div className="r">
        <button type="button" className="ibtn" onClick={() => setSairAberto(true)} aria-label="Sair da avaliação (o rascunho fica salvo neste aparelho)">
          <Ic n="x" s={18} w={2.2} />
        </button>
        <div
          className="segs segs-n"
          style={{ ['--n' as string]: etapas.length }}
          role="progressbar"
          aria-label="Progresso da avaliação"
          aria-valuemin={0}
          aria-valuemax={etapas.length}
          aria-valuenow={atual.k === 'revisao' ? etapas.length : Math.max(0, etapaAtual)}
          aria-valuetext={atual.k === 'revisao' ? 'Revisão' : `Etapa ${etapaAtual + 1} de ${etapas.length}: ${atual.grupo}`}
        >
          {etapas.map((g, k) => (
            <span key={g} className={k < etapaAtual || atual.k === 'revisao' ? 'is-done' : ''}>
              <i style={{ width: k < etapaAtual || atual.k === 'revisao' ? '100%' : k === etapaAtual ? `${Math.max(fracEtapa(g), 8)}%` : '0%' }} />
            </span>
          ))}
        </div>
        <span className="saved"><i />RASCUNHO NESTE APARELHO</span>
      </div>
      <div className="pchip">
        <span className="av ink" aria-hidden="true">{p.nome.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span>
        <span style={{ fontSize: 15 }}>
          <b style={{ fontWeight: 600 }}>{p.nome}</b>{' '}
          <span className="mut">· {p.periodoLabel} · {p.prazoTexto}</span>
        </span>
      </div>
    </header>
  );

  const trilha = (
    <nav className="rail" aria-label="Etapas da avaliação">
      {etapas.map((g, k) => {
        const estado = atual.k === 'revisao' || k < etapaAtual ? 'past' : k === etapaAtual ? 'now' : '';
        return (
          <button
            key={g}
            type="button"
            className={`st ${estado}`}
            aria-current={estado === 'now' ? 'step' : undefined}
            onClick={() => { const n = telas.findIndex((t) => t.grupo === g); if (n >= 0) ir(n, 'barra'); }}
          >
            <span className="b">{estado === 'past' ? <Ic n="check" s={13} w={3} /> : k + 1}</span>
            <span className="st-t">{g}</span>
          </button>
        );
      })}
      <button type="button" className={`st ${atual.k === 'revisao' ? 'now' : ''}`} aria-current={atual.k === 'revisao' ? 'step' : undefined} onClick={() => ir(telas.length - 1, 'barra')}>
        <span className="b">R</span><span className="st-t">Revisão</span>
      </button>
      <div className="tip">
        <b>O que considerar</b>
        Responda pelo que você viu no dia a dia, não pelo que ouviu falar. Pode parar quando quiser: o rascunho fica salvo neste aparelho.
      </div>
    </nav>
  );

  // ── rótulos de resposta (para a revisão e o lado direito) ──
  const notaLabel = (di: number) => (p.ratings[dims[di].key] ? RATING_LABELS[p.ratings[dims[di].key] as RatingOption] : '');
  const subLabel = (di: number, qi: number) => {
    const v = p.subAnswers[dims[di].key]?.[dims[di].subQuestions[qi].key];
    return v ? SUB_ANSWER_LABELS[v] : '';
  };

  const linhasRevisao = useMemo(() => {
    const rows: { grupo: string; sub: string; v: string; det: [string, string][] }[] = dims.map((d, di) => ({
      grupo: d.name,
      sub: `${d.subQuestions.length} frases`,
      v: notaLabel(di) || 'Falta responder',
      det: [['Nota geral', notaLabel(di)], ...d.subQuestions.map((sq, qi): [string, string] => [sq.text, subLabel(di, qi)])],
    }));
    const grupos = [...new Set(p.passos.map((s) => s.grupo))];
    grupos.forEach((g) => {
      const ps = p.passos.filter((s) => s.grupo === g);
      const falta = ps.some((s) => !s.completo && !s.opcional);
      const vazio = ps.every((s) => !s.completo);
      rows.push({
        grupo: g,
        sub: ps.map((s) => s.kick.replace(/^.*·\s*/, '')).join(' · '),
        v: falta ? 'Falta responder' : vazio && ps.every((s) => s.opcional) ? 'Em branco' : 'Respondido',
        det: ps.flatMap((s) => s.resumo),
      });
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, p.passos, p.ratings, p.subAnswers]);

  const lado = (() => {
    if (atual.k === 'nota' || atual.k === 'sub' || atual.k === 'resumo') {
      const di = atual.d;
      return (
        <>
          <span className="kick">Respostas desta etapa</span>
          <div className="ansl card" style={{ padding: '6px 16px' }}>
            <div><span>Nota geral</span><b>{notaLabel(di) || '—'}</b></div>
            {dims[di].subQuestions.map((sq, qi) => (
              <div key={sq.key}><span>{sq.text.slice(0, 46)}…</span><b>{subLabel(di, qi) || '—'}</b></div>
            ))}
          </div>
        </>
      );
    }
    return (
      <>
        <span className="kick">Resumo até aqui</span>
        <div className="ansl card" style={{ padding: '6px 16px' }}>
          {dims.map((d, di) => (
            <div key={d.key}><span>{d.name}</span><b>{notaLabel(di) || '—'}</b></div>
          ))}
          {linhasRevisao.slice(dims.length).map((r) => (
            <div key={r.grupo}><span>{r.grupo}</span><b>{r.v}</b></div>
          ))}
        </div>
      </>
    );
  })();

  const voltar = i > 0 && (
    <button type="button" className="back-q" onClick={() => ir(i - 1)}>Voltar para a anterior</button>
  );

  const aviso = tentou && (
    <p className="miss" role="alert"><Ic n="info" s={16} /> Falta responder esta pergunta</p>
  );

  // ── telas ──
  let palco: ReactNode;
  if (atual.k === 'data') {
    palco = (
      <div className="stage swap-in" style={{ ['--dir' as string]: dir }}>
        <span className="kick">Antes de começar</span>
        <h1 className="H" tabIndex={-1} data-foco>Data desta avaliação</h1>
        <p className="desc">Confira a data. Por padrão é hoje.</p>
        {p.avisos && <div className="pass-avisos">{p.avisos}</div>}
        <div className="pass-data">
          <label htmlFor="av-data" className="sr">Data desta avaliação</label>
          <div className="field">
            <input
              id="av-data"
              type="date"
              value={p.evaluationDate}
              min={p.dataMin}
              max={p.dataMax}
              onChange={(e) => p.onDate(e.target.value)}
            />
          </div>
        </div>
        {aviso}
        <div className="pass-acoes">
          <button type="button" className="btn btn-ink btn-block press" style={{ minHeight: 58 }} onClick={() => continuar(atual)}>
            Começar <Ic n="arrow" s={20} w={2.2} className="arr" />
          </button>
        </div>
      </div>
    );
  } else if (atual.k === 'nota') {
    const d = dims[atual.d];
    const sel = p.ratings[d.key];
    palco = (
      <div className="stage swap-in" style={{ ['--dir' as string]: dir }}>
        <span className="kick">Etapa {etapaAtual + 1} · {d.name}</span>
        <h1 className="H" tabIndex={-1} data-foco>
          Como está {p.primeiroNome}, de modo geral?
        </h1>
        <p className="desc">{d.gradedQuestion}</p>
        <div className="grades" role="radiogroup" aria-label={`Nota geral: ${d.name}`}>
          {RATING_OPTIONS.map((o, k) => (
            <button
              key={o}
              type="button"
              className="gr mk-opt"
              style={{ ['--n' as string]: k }}
              role="radio"
              aria-checked={sel === o}
              onClick={(e) => responder(e.currentTarget, () => p.onRating(d.key, o))}
            >
              <Ic n={ICONE_NOTA[o]} s={28} w={1.9} />
              <span>{RATING_LABELS[o]}</span>
            </button>
          ))}
        </div>
        {aviso}
        <div className="pass-acoes pass-acoes-lin">
          {voltar}
          {sel && <button type="button" className="btn btn-ink press" onClick={() => continuar(atual)}>Continuar <Ic n="arrow" s={18} w={2.2} className="arr" /></button>}
        </div>
      </div>
    );
  } else if (atual.k === 'sub') {
    const d = dims[atual.d];
    const sq = d.subQuestions[atual.q];
    const sel = p.subAnswers[d.key]?.[sq.key];
    palco = (
      <div className="stage swap-in" style={{ ['--dir' as string]: dir }}>
        <div className="qcount">
          <span className="kick">Frase {atual.q + 1} de {d.subQuestions.length} · {d.name}</span>
          <span className="qdots" aria-hidden="true">
            {d.subQuestions.map((_, k) => <i key={k} className={k === atual.q ? 'on' : k < atual.q ? 'past' : ''} />)}
          </span>
        </div>
        <div className="qcard">
          <span className="A">{p.primeiroNome}…</span>
          <p tabIndex={-1} data-foco>{sq.text}</p>
        </div>
        <div className="answers" role="radiogroup" aria-label="Resposta">
          {sq.options.map((o, k) => (
            <button
              key={o}
              type="button"
              className="ans mk-opt"
              style={{ ['--n' as string]: k }}
              role="radio"
              aria-checked={sel === o}
              onClick={(e) => responder(e.currentTarget, () => p.onSub(d.key, sq.key, o))}
            >
              <span className="k">{LETRAS[k]}</span>
              {SUB_ANSWER_LABELS[o]}
            </button>
          ))}
          {voltar}
        </div>
        {aviso}
      </div>
    );
  } else if (atual.k === 'resumo') {
    const di = atual.d;
    const d = dims[di];
    const etapaN = etapas.indexOf(d.name) + 1;
    palco = (
      <div className="stage swap-in" style={{ ['--dir' as string]: dir }}>
        <div className="stepdone">
          <span className="seal-s mk-stamp"><Ic n="check" s={40} w={3} /></span>
          <span className="kick" style={{ marginTop: 22 }}>Etapa {etapaN} de {etapas.length} concluída</span>
          <h1 className="H" tabIndex={-1} data-foco style={{ fontSize: 30, marginTop: 8 }}>{d.name}</h1>
          <div className="sumchips">
            {[['Nota', notaLabel(di)], ...d.subQuestions.map((sq, qi): [string, string] => ['0' + (qi + 1), subLabel(di, qi)])].map(([k, v]) => (
              <span key={k}><em>{k}</em><b>{v || '—'}</b></span>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-ink btn-block press" style={{ minHeight: 58 }} onClick={() => continuar(atual)}>
          Próxima etapa <Ic n="arrow" s={20} w={2.2} className="arr" />
        </button>
        <button type="button" className="back-q" onClick={() => ir(telas.findIndex((t) => t.k === 'nota' && t.d === di))}>Rever respostas desta etapa</button>
      </div>
    );
  } else if (atual.k === 'livre') {
    const s = p.passos[atual.p];
    const ultimo = atual.p === p.passos.length - 1;
    palco = (
      <div className="stage swap-in page-form" style={{ ['--dir' as string]: dir }}>
        <span className="kick">{s.kick}</span>
        <h1 className="H" tabIndex={-1} data-foco>{s.titulo}</h1>
        {s.descricao && <p className="desc">{s.descricao}</p>}
        <div className={`pass-livre ${tentou && !s.completo && !s.opcional ? 'pass-erro' : ''}`}>{s.node}</div>
        {aviso}
        <div className="pass-acoes">
          <button type="button" className={`btn ${ultimo ? 'btn-gold' : 'btn-ink'} btn-block press`} style={{ minHeight: 58 }} onClick={() => continuar(atual)}>
            {ultimo ? 'Revisar e enviar' : s.opcional && !s.completo ? 'Pular esta etapa' : 'Continuar'} <Ic n="arrow" s={20} w={2.2} className="arr" />
          </button>
          {voltar}
        </div>
      </div>
    );
  } else {
    palco = (
      <Revisao
        p={p}
        linhas={linhasRevisao}
        aberto={rvAberto}
        setAberto={setRvAberto}
        corrigir={(grupo) => { const n = telas.findIndex((t) => t.grupo === grupo); if (n >= 0) ir(n, 'barra'); }}
        enviar={() => {
          const n = primeiraIncompleta();
          if (n >= 0) {
            sound('bad');
            buzz([30, 40, 30]);
            ir(n, 'barra');
            setTimeout(() => { setTentou(true); p.onTentou?.(); }, 450);
            return;
          }
          buzz(12);
          p.onEnviar();
        }}
        voltar={() => ir(i - 1, 'barra')}
        dir={dir}
      />
    );
  }

  return (
    <div className="flow-ov" role="region" aria-label={`Avaliação de ${p.nome}`}>
      <div className="flow" ref={topoRef}>
        {cabecalho}
        <div className="fgrid">
          {trilha}
          <div ref={palcoRef} className="stage-box" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>{palco}</div>
          <aside className="aside-r" aria-live="polite">{lado}</aside>
        </div>
      </div>

      {p.enviando && (
        <>
          <div className="sheet-bd" aria-hidden="true" />
          <section className="sending" role="status">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <b style={{ fontSize: 20 }}>Enviando avaliação…</b>
              <span className="spin" aria-hidden="true" />
            </div>
            <p className="mut" style={{ marginTop: 10 }}>Aguarde: só confirmamos depois que o sistema registrar.</p>
          </section>
        </>
      )}

      {sairAberto && (
        <>
          <div className="sheet-bd" onClick={() => setSairAberto(false)} aria-hidden="true" />
          <section ref={sairRef} className="sheet" role="dialog" aria-modal="true" aria-label="Sair da avaliação">
            <span className="grab" aria-hidden="true" />
            <h2 className="H" style={{ fontSize: 24 }}>Sair da avaliação?</h2>
            <p className="mut" style={{ margin: '8px 0 18px' }}>O que você já respondeu fica salvo só neste aparelho por 7 dias. Quando voltar, você continua de onde parou.</p>
            <button type="button" className="btn btn-ink btn-block press" onClick={() => setSairAberto(false)}>Continuar avaliando</button>
            <button type="button" className="btn btn-ghost btn-block press" style={{ marginTop: 8 }} onClick={p.onSair}>Sair e voltar à ficha</button>
          </section>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Revisão ───────────────────────── */

function Revisao({
  p, linhas, aberto, setAberto, corrigir, enviar, voltar, dir,
}: {
  p: AvaliacaoPassosProps;
  linhas: { grupo: string; sub: string; v: string; det: [string, string][] }[];
  aberto: number;
  setAberto: (n: number) => void;
  corrigir: (grupo: string) => void;
  enviar: () => void;
  voltar: () => void;
  dir: number;
}) {
  return (
    <div className="stage-rev swap-in" style={{ ['--dir' as string]: dir }}>
      <div className="review">
        <div className="vbox">
          <span className="av ink" style={{ width: 56, height: 56, borderRadius: 18, fontSize: 18 }} aria-hidden="true">
            {p.nome.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
          </span>
          <p className="mut" style={{ marginTop: 12, fontSize: 15 }}>
            {p.periodoLabel} de <b style={{ color: 'var(--c-ink)', fontWeight: 600 }}>{p.nome}</b>
          </p>
          <div className="verdict">
            <span className="kick" style={{ marginTop: 12 }}>{p.veredito.rotulo}</span>
            <h1 className="big mk-stamp" tabIndex={-1} data-foco style={{ animationDelay: '.45s', marginTop: 6 }}>{p.veredito.valor || 'Revisão'}</h1>
            {p.veredito.selo && (
              <span className="tag t-gold" style={{ marginTop: 16, height: 32, padding: '0 12px' }}>
                <Ic n="star" s={14} />&nbsp;{p.veredito.selo}
              </span>
            )}
          </div>
          <div className="slide-wrap">
            {p.erroEnvio && <p className="miss" role="alert" style={{ marginBottom: 10 }}><Ic n="info" s={16} /> {p.erroEnvio}</p>}
            <SlideEnviar onEnviar={enviar} desabilitado={p.enviando} />
            <p className="mut slide-nota">Depois de enviar, a avaliação vai para o Histórico e o RH recebe na hora.</p>
          </div>
        </div>
        <div>
          <div className="sechead" style={{ marginTop: 0 }}>
            <h2 className="H">Respostas</h2>
            <span className="ln" />
            <button type="button" className="link" onClick={voltar}>Voltar</button>
          </div>
          <div className="rvlist">
            {linhas.map((r, k) => (
              <div key={r.grupo} className="rv mk-opt" style={{ ['--n' as string]: Math.min(k, 8) }} data-open={aberto === k ? '' : undefined}>
                <button type="button" onClick={() => setAberto(aberto === k ? -1 : k)} aria-expanded={aberto === k}>
                  <span className="n">{k + 1}</span>
                  <span className="t"><b>{r.grupo}</b><small>{r.sub}</small></span>
                  <span className="v">{r.v}</span>
                  <Ic n="down" s={18} className="chev" />
                </button>
                {aberto === k && (
                  <dl>
                    {r.det.map(([q, v]) => (
                      <div key={q}><dt>{q}</dt><dd>{v || '—'}</dd></div>
                    ))}
                    <button type="button" className="link" style={{ justifySelf: 'start', minHeight: 44 }} onClick={() => corrigir(r.grupo)}>Corrigir este item</button>
                  </dl>
                )}
              </div>
            ))}
          </div>
          <p className="mut slide-nota-m">Depois de enviar, a avaliação vai para o Histórico e o RH recebe na hora.</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Deslizar para enviar ─────────────────────
 * Arrastar o botão até o fim envia. Para teclado e leitor de tela, Enter ou
 * Espaço no botão envia direto. Um toque solto NÃO envia (evita envio sem querer). */
function SlideEnviar({ onEnviar, desabilitado }: { onEnviar: () => void; desabilitado: boolean }) {
  const pista = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef<{ px: number; x0: number } | null>(null);
  const FIM = (): number => Math.max(0, (pista.current?.clientWidth ?? 300) - 64);

  const mover = (e: PointerEvent<HTMLButtonElement>) => {
    if (!inicio.current) return;
    setX(Math.min(FIM(), Math.max(0, inicio.current.x0 + e.clientX - inicio.current.px)));
  };
  const soltar = () => {
    if (!inicio.current) return;
    const chegou = x >= FIM() * 0.88;
    inicio.current = null;
    setArrastando(false);
    if (chegou && !desabilitado) {
      setX(FIM());
      onEnviar();
      // Se o envio não começar (revisão incompleta), o botão volta ao início.
      setTimeout(() => setX(0), 700);
    } else {
      setX(0);
    }
  };
  const teclas = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && !desabilitado) {
      e.preventDefault();
      onEnviar();
    }
  };

  return (
    <div className="slide" ref={pista}>
      <span className="fill" style={{ width: x + 56, transition: arrastando ? 'none' : 'width .25s var(--ease)' }} />
      <span className="lbl" style={{ opacity: Math.max(0, 1 - x / 180) }}>Deslize para enviar</span>
      <button
        type="button"
        className="knob"
        aria-label="Enviar avaliação: arraste para a direita ou pressione Enter"
        disabled={desabilitado}
        style={{ transform: `translateX(${x}px)`, transition: arrastando ? 'none' : 'transform .25s var(--ease)' }}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); inicio.current = { px: e.clientX, x0: x }; setArrastando(true); }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onKeyDown={teclas}
      >
        <Ic n="send" s={22} w={2.2} />
      </button>
    </div>
  );
}
