'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EntradaCinematica } from '@/components/brand/EntradaCinematica';
import { PesquisaPassos, minutosEstimados } from '@/components/survey/PesquisaPassos';
import { Ic } from '@/components/sp/Ic';
import { burst, center, sound } from '@/lib/motion';
import type { AnswerValue, QuestionData } from '@/components/survey/QuestionField';
import { LiveStatus, Skeleton, Spinner } from '@/components/async';
import { formatAccessCode, isAccessCodeFormat, parseAccessCodeHash } from '@/lib/accessCodeFormat';

// 'submitting' saiu: o envio acontece DENTRO da tela de revisão, com o estado
// numa folha de baixo, em vez de trocar a tela inteira por uma frase.
// A revisão agora mora dentro de 'questions' (PesquisaPassos).
type Stage = 'loading' | 'no-survey' | 'select' | 'intro' | 'codigo' | 'sector' | 'unit' | 'questions' | 'done' | 'error';

interface OpenSurvey {
  id: string;
  name: string;
  description: string | null;
}

interface SurveyDetail {
  survey: { id: string; name: string; description: string | null; requireAccessCode?: boolean };
  questions: (QuestionData & { dimension: { id: string; name: string; order: number } | null })[];
  sectors: { id: string; name: string }[];
  units: { id: string; name: string }[];
}

// Pesquisas são anônimas — não há como o servidor saber "este colaborador já
// respondeu". O controle de "já respondida" é só deste navegador/dispositivo
// (localStorage), nunca ligado a uma identidade — não quebra o anonimato.
const ANSWERED_KEY = 'spot_clima_answered_surveys';

function getAnsweredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ANSWERED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// Bilhete de resposta (pesquisa com código de participação): o código do papel
// é trocado por ele ao começar. Fica só nesta aba (sessionStorage) para quem
// recarregar a página no meio não perder o código já gasto.
const TICKET_KEY = 'spot_clima_ticket_';

function readTicket(surveyId: string): string | null {
  try {
    return sessionStorage.getItem(TICKET_KEY + surveyId);
  } catch {
    return null;
  }
}

function saveTicket(surveyId: string, ticket: string | null) {
  try {
    if (ticket) sessionStorage.setItem(TICKET_KEY + surveyId, ticket);
    else sessionStorage.removeItem(TICKET_KEY + surveyId);
  } catch {
    // sessionStorage indisponível — o bilhete fica só na memória da página.
  }
}

function markAnswered(surveyId: string) {
  try {
    const ids = getAnsweredIds();
    ids.add(surveyId);
    localStorage.setItem(ANSWERED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage indisponível (ex.: navegação privada) — segue sem persistir.
  }
}

const ROTULO = 'PESQUISA DE CLIMA · ANÔNIMA';
const SELO = 'Anônima: não pedimos seu nome';
const FRASE = { linhas: ['Sua opinião,', 'sem nome,', 'faz a casa melhor.'], destaque: 'sem' };

export default function SurveyPage() {
  const [stage, setStage] = useState<Stage>('loading');
  const [openSurveys, setOpenSurveys] = useState<OpenSurvey[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [data, setData] = useState<SurveyDetail | null>(null);
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  /**
   * Qual pesquisa está abrindo.
   *
   * O próprio cartão mostra que está abrindo e os outros ficam desabilitados:
   * numa rede ruim, o colaborador não fica olhando uma tela branca sem saber
   * se acertou o botão.
   */
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /**
   * Código de participação (quando a pesquisa exige). Vem digitado do papel
   * ou do QR dele, que abre "/survey#codigo=XXXX-XXXX" — o fragmento nunca
   * chega ao servidor e sai da barra de endereço assim que é lido.
   */
  const [accessCode, setAccessCode] = useState('');
  /** Por que o código não passou (formato, já usado, muitos erros) — null se ok. */
  const [codigoErro, setCodigoErro] = useState<string | null>(null);
  const [conferindoCodigo, setConferindoCodigo] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  /** Para onde ir depois do código: o setor no começo, a revisão se o bilhete caiu no envio. */
  const [depoisDoCodigo, setDepoisDoCodigo] = useState<'sector' | 'questions'>('sector');

  useEffect(() => {
    const doLink = parseAccessCodeHash(window.location.hash);
    if (doLink) {
      setAccessCode(doLink);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setAnsweredIds(getAnsweredIds());
    fetch('/api/public/surveys')
      .then((r) => {
        // Sem esta checagem, um 500 que devolve {"error": ...} passava como
        // sucesso e `d.surveys` vinha undefined — a tela quebrava com um erro
        // de runtime em vez de mostrar a tela de falha, que tem saída.
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { surveys?: OpenSurvey[] }) => {
        const lista = d.surveys ?? [];
        setOpenSurveys(lista);
        setStage(lista.length === 0 ? 'no-survey' : 'select');
      })
      .catch(() => setStage('error'));
  }, []);

  // Cada etapa é a mesma página trocando de conteúdo: sem isto o foco ficava no
  // botão que acabou de sumir e quem usa leitor de tela ou teclado não sabia
  // que a tela mudou. Move o foco para o título da etapa nova e volta ao topo.
  const etapaAnterior = useRef<Stage>('loading');
  useEffect(() => {
    const veioDoCarregamento = etapaAnterior.current === 'loading';
    etapaAnterior.current = stage;
    if (stage === 'loading' || veioDoCarregamento) return;
    window.scrollTo({ top: 0 });
    // O campo do código já nasce com foco (autoFocus): não o tira dele.
    if (document.activeElement?.matches('input, textarea, select')) return;
    const titulo = document.querySelector<HTMLElement>('h1, h2');
    if (titulo) {
      titulo.tabIndex = -1;
      titulo.focus({ preventScroll: true });
    }
  }, [stage]);

  const selectSurvey = async (surveyId: string) => {
    setAbrindoId(surveyId);
    try {
      const res = await fetch(`/api/public/surveys/${surveyId}`);
      if (!res.ok) throw new Error('not found');
      const d: SurveyDetail = await res.json();
      setData(d);
      setSectorId(null);
      setUnitId(null);
      setAnswers({});
      setSubmitError(null);
      setTicket(d.survey.requireAccessCode ? readTicket(d.survey.id) : null);
      setDepoisDoCodigo('sector');
      setCodigoErro(null);
      setStage('intro');
    } catch {
      setStage('error');
    } finally {
      setAbrindoId(null);
    }
  };

  const backToSelection = () => {
    setData(null);
    setStage(openSurveys.length === 0 ? 'no-survey' : 'select');
  };

  // Mesmo recorte de antes: as perguntas agrupadas por dimensão, na ordem dela.
  const totalPerguntas = useMemo(() => data?.questions.length ?? 0, [data]);

  if (stage === 'loading') {
    // Esqueleto com a forma da tela: é a primeira coisa que o colaborador vê,
    // vinda de um QR code na parede, e "Carregando..." numa página branca é o
    // que faz a pessoa fechar e não voltar.
    return (
      <div className="pesq-centro" aria-busy="true">
        <LiveStatus>Carregando a pesquisa...</LiveStatus>
        <div className="card pesq-card">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-14 w-full rounded-xl2" />
        </div>
      </div>
    );
  }

  if (stage === 'no-survey') {
    return (
      <EntradaCinematica
        key="no-survey"
        eyebrow={ROTULO}
        frase={{ linhas: ['Por enquanto,', 'nenhuma pesquisa', 'está aberta.'], destaque: 'nenhuma' }}
        subtitulo="Quando o RH publicar a próxima, o link continua sendo este mesmo."
        selo={SELO}
        abertura={<p className="aviso-n">Se você recebeu um aviso de que há uma pesquisa em andamento e mesmo assim está vendo esta tela, fale com o RH.</p>}
        rotuloPainel="Pesquisa de clima"
      />
    );
  }

  if (stage === 'error') {
    // Sem saída, esta tela prendia o colaborador: nem recarregava, nem voltava
    // para a lista. Agora ela oferece as duas ações.
    return (
      <div className="pesq-centro" key="error">
        <div className="card pesq-card">
          <h1 className="H" style={{ fontSize: 26 }}>Não foi possível carregar a pesquisa.</h1>
          <p className="mut">Pode ter sido uma falha momentânea de conexão. Tente de novo; se continuar, avise o RH.</p>
          <button type="button" className="btn btn-gold btn-block press" onClick={() => window.location.reload()}>Tentar de novo</button>
          {openSurveys.length > 0 && (
            <button type="button" className="btn btn-ghost btn-block press" onClick={backToSelection}>Voltar para a lista de pesquisas</button>
          )}
        </div>
      </div>
    );
  }

  if (stage === 'select') {
    const allAnswered = openSurveys.every((s) => answeredIds.has(s.id));
    const lista = (
      <div className="pesq-lista">
        {openSurveys.map((s) => {
          const answered = answeredIds.has(s.id);
          const abrindo = abrindoId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={answered || abrindoId !== null}
              aria-busy={abrindo || undefined}
              onClick={() => selectSurvey(s.id)}
              className="nopt"
            >
              <span className="nopt-t">
                <b>{s.name}</b>
                {s.description && <small>{s.description}</small>}
              </span>
              {abrindo && <span className="nopt-st"><Spinner className="h-4 w-4" /> Abrindo…</span>}
              {answered && <span className="nopt-st">Já respondida</span>}
            </button>
          );
        })}
      </div>
    );
    return (
      <EntradaCinematica
        key="select"
        eyebrow={ROTULO}
        frase={FRASE}
        subtitulo={allAnswered ? 'Você já respondeu todas as pesquisas disponíveis. Obrigado por participar.' : 'Escolha a pesquisa que quer responder. Cada uma leva poucos minutos.'}
        selo={SELO}
        abertura={lista}
        rotuloPainel="Pesquisas abertas"
      />
    );
  }

  if (!data?.survey) return null;

  // Passos da entrada, um por tela: código (só se a pesquisa exige), setor e unidade.
  const precisaCodigo = Boolean(data.survey.requireAccessCode);
  const totalEtapas = (precisaCodigo ? 1 : 0) + 2;
  const numeroDe = (etapa: 'codigo' | 'sector' | 'unit') =>
    etapa === 'codigo' ? 1 : etapa === 'sector' ? (precisaCodigo ? 2 : 1) : (precisaCodigo ? 3 : 2);

  if (stage === 'intro') {
    const minutos = minutosEstimados(totalPerguntas);
    return (
      <EntradaCinematica
        key="intro"
        eyebrow={ROTULO}
        frase={FRASE}
        subtitulo={`Leva cerca de ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}. Ninguém vai saber quem respondeu.`}
        selo={SELO}
        rodape={[
          { rotulo: '01 · ANÔNIMA', texto: 'Não coletamos nome, e-mail nem matrícula. Só o setor e a unidade.' },
          { rotulo: '02 · UMA PERGUNTA POR VEZ', texto: 'Você pode voltar para a anterior quando quiser.' },
          { rotulo: '03 · SÓ O GRUPO', texto: 'O RH vê só os resultados do grupo.' },
        ]}
        rotuloPainel={data.survey.name}
        abertura={
          <>
            <p className="pesq-nome">{data.survey.name}</p>
            {data.survey.description && <p className="aviso-n">{data.survey.description}</p>}
            <button type="button" className="btn btn-gold btn-mail press" onClick={() => setStage(precisaCodigo && !ticket ? 'codigo' : 'sector')}>
              <span className="lbl" style={{ textAlign: 'center' }}>Começar pesquisa</span>
              <Ic n="arrow" s={20} w={2.2} className="arr" />
            </button>
            {openSurveys.length > 1 && (
              <button type="button" className="link-n" onClick={backToSelection}>← Ver outras pesquisas abertas</button>
            )}
          </>
        }
      />
    );
  }

  if (stage === 'codigo') {
    /**
     * Troca o código do papel por um bilhete, ANTES das respostas.
     *
     * Antes o código ia junto com as respostas, e o banco gravava as duas
     * coisas na mesma transação — quem soubesse quem recebeu cada papel podia
     * chegar à resposta. Agora o código é gasto aqui, num passo separado.
     */
    const surveyId = data.survey.id;
    const conferir = async () => {
      if (conferindoCodigo) return;
      if (!isAccessCodeFormat(accessCode)) {
        setCodigoErro('Confira o código: são 8 letras e números, como no papel que você recebeu.');
        document.getElementById('codigo-participacao')?.focus();
        return;
      }
      setConferindoCodigo(true);
      setCodigoErro(null);
      try {
        const res = await fetch('/api/public/survey-tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ surveyId, accessCode: formatAccessCode(accessCode) }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || typeof body.ticket !== 'string') {
          setCodigoErro(body.error ?? 'Não foi possível conferir o código agora. Tente de novo.');
          return;
        }
        saveTicket(surveyId, body.ticket);
        setTicket(body.ticket);
        setAccessCode('');
        setStage(depoisDoCodigo);
      } catch {
        setCodigoErro('Não foi possível conferir o código agora — pode ter sido a conexão. Tente de novo.');
      } finally {
        setConferindoCodigo(false);
      }
    };

    const reenvio = depoisDoCodigo === 'questions';
    return (
      <EntradaCinematica
        key="codigo"
        eyebrow={ROTULO}
        frase={FRASE}
        subtitulo=""
        abertura={null}
        numero={reenvio ? undefined : numeroDe('codigo')}
        total={reenvio ? undefined : totalEtapas}
        onVoltar={() => setStage(reenvio ? 'questions' : 'intro')}
        painel={
          <form noValidate onSubmit={(e) => { e.preventDefault(); conferir(); }}>
            <h2 className="pesq-h2">{reenvio ? 'Digite o código de novo' : 'Qual é o código do papel?'}</h2>
            <p className="sub">
              {reenvio
                ? 'Precisamos do código de novo para enviar. As suas respostas continuam guardadas.'
                : 'Ele vale uma resposta e não fica ligado a você nem às suas respostas.'}
            </p>
            <label htmlFor="codigo-participacao" className="sr">Código de participação</label>
            <div className={`nfield ${codigoErro ? 'bad' : ''}`}>
              <input
                id="codigo-participacao"
                required
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={9}
                placeholder="Ex.: ABCD-EFGH"
                aria-invalid={codigoErro ? true : undefined}
                aria-describedby="codigo-dica"
                style={{ textAlign: 'center', letterSpacing: '.2em', textTransform: 'uppercase' }}
                value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value); setCodigoErro(null); }}
              />
            </div>
            <p id="codigo-dica" role={codigoErro ? 'alert' : undefined} className={codigoErro ? 'nerr' : 'nhint'}>
              {codigoErro ?? 'São 8 letras e números, como ABCD-EFGH. Quem leu o QR do papel já recebe o código preenchido.'}
            </p>
            <div className="step-foot">
              <button type="submit" className="btn btn-gold btn-block press" disabled={conferindoCodigo} aria-busy={conferindoCodigo || undefined}>
                {conferindoCodigo ? 'Conferindo…' : <>Continuar <Ic n="arrow" s={20} w={2.2} className="arr" /></>}
              </button>
              <p className="secure"><Ic n="lock" s={14} /> {SELO}</p>
            </div>
          </form>
        }
      />
    );
  }

  if (stage === 'sector' || stage === 'unit') {
    const ehSetor = stage === 'sector';
    const lista = ehSetor ? data.sectors : data.units;
    const escolhido = ehSetor ? sectorId : unitId;
    const escolher = ehSetor ? setSectorId : setUnitId;
    return (
      <EntradaCinematica
        key={stage}
        eyebrow={ROTULO}
        frase={FRASE}
        subtitulo=""
        abertura={null}
        numero={numeroDe(stage)}
        total={totalEtapas}
        onVoltar={() => setStage(ehSetor ? (precisaCodigo ? 'codigo' : 'intro') : 'sector')}
        painel={
          <div>
            <h2 className="pesq-h2">{ehSetor ? 'Qual é o seu setor?' : 'Qual é a sua unidade?'}</h2>
            <p className="sub">
              {ehSetor
                ? 'Usamos só o setor e a unidade para organizar os resultados. Sua resposta continua anônima.'
                : 'A loja em que você trabalha. Sua resposta continua anônima.'}
            </p>
            <div className="nopts" role="radiogroup" aria-label={ehSetor ? 'Setor' : 'Unidade'}>
              {lista.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={escolhido === o.id} className="nopt nopt-r" onClick={() => escolher(o.id)}>
                  <span className="nopt-d"><Ic n="check" s={14} w={3.2} /></span>
                  <span className="nopt-t"><b>{o.name}</b></span>
                </button>
              ))}
            </div>
            <div className="step-foot">
              <button
                type="button"
                className={`btn ${escolhido ? 'btn-gold' : 'btn-off'} btn-block press`}
                aria-disabled={!escolhido}
                onClick={() => { if (escolhido) setStage(ehSetor ? 'unit' : 'questions'); }}
              >
                Continuar <Ic n="arrow" s={20} w={2.2} className="arr" />
              </button>
              <p className="secure"><Ic n="lock" s={14} /> {SELO}</p>
            </div>
          </div>
        }
      />
    );
  }

  if (stage === 'questions') {
    /**
     * Envia SEM trocar a tela: o estado de envio aparece numa folha de baixo e,
     * numa falha, a revisão continua com as respostas. Bilhete, código e corpo
     * do envio: os mesmos de antes.
     */
    const exigeCodigo = Boolean(data.survey.requireAccessCode);
    const surveyId = data.survey.id;
    const pedirCodigoDeNovo = (motivo: string | null) => {
      saveTicket(surveyId, null);
      setTicket(null);
      setCodigoErro(motivo);
      setDepoisDoCodigo('questions');
      setStage('codigo');
    };
    const concluir = () => {
      saveTicket(surveyId, null);
      setTicket(null);
      markAnswered(surveyId);
      setAnsweredIds(getAnsweredIds());
      setStage('done');
    };
    const submit = async () => {
      if (enviando) return;
      if (exigeCodigo && !ticket) {
        pedirCodigoDeNovo(null);
        return;
      }
      setEnviando(true);
      setSubmitError(null);
      try {
        const payload = {
          surveyId,
          sectorId,
          unitId,
          answers: Object.entries(answers).map(([questionId, v]) => ({ questionId, ...v })),
          ...(exigeCodigo && ticket ? { ticket } : {}),
        };
        const res = await fetch('/api/public/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          // Resposta já gravada com este bilhete (a conexão caiu depois do
          // envio e a pessoa tentou de novo): é sucesso, não erro.
          if (res.status === 409 && body.alreadySent) {
            concluir();
            return;
          }
          // Bilhete vencido ou recusado: pede outro código sem perder as respostas.
          if (body.accessCode === 'invalid') {
            pedirCodigoDeNovo(body.error ?? null);
            return;
          }
          throw new Error(body.error ?? 'Falha ao enviar.');
        }
        concluir();
      } catch (e) {
        setSubmitError(
          e instanceof Error && e.message
            ? e.message
            : 'Não foi possível enviar agora — pode ter sido a conexão.',
        );
      } finally {
        setEnviando(false);
      }
    };

    return (
      <PesquisaPassos
        key={data.survey.id}
        questoes={data.questions}
        respostas={answers}
        onResponder={(id, v) => setAnswers((prev) => ({ ...prev, [id]: v }))}
        onVoltarInicio={() => setStage('unit')}
        // Sair não guarda nada: a pesquisa nunca teve rascunho. Volta ao começo dela.
        onSair={() => { setAnswers({}); setSubmitError(null); setStage('intro'); }}
        enviando={enviando}
        erroEnvio={submitError}
        onEnviar={submit}
      />
    );
  }

  if (stage === 'done') {
    return <PesquisaEnviada outras={openSurveys.length > 1} onOutras={backToSelection} />;
  }

  return null;
}

/** Obrigado: painel âmbar com selo e confete. Sem "próxima pessoa", sequência ou gamificação. */
function PesquisaEnviada({ outras, onOutras }: { outras: boolean; onOutras: () => void }) {
  const selo = useRef<HTMLSpanElement>(null);
  const [fechou, setFechou] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (selo.current) {
        const c = center(selo.current);
        burst(c.x, c.y, 60);
      }
      sound('end');
    }, 250);
    return () => clearTimeout(t);
  }, []);
  const fechar = () => {
    window.close();
    // O navegador só deixa fechar abas abertas por script: se não fechou, avisa.
    setTimeout(() => setFechou(true), 400);
  };
  return (
    <div className="done" role="status">
      <section className="done-hero">
        <span className="seal" ref={selo}>
          <svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="var(--c-accent)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h1 className="H" tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })}>Obrigado.</h1>
        <p>Suas respostas entram junto com as da equipe, sem seu nome. O RH vê só os resultados do grupo.</p>
      </section>
      <div className="done-body">
        {outras && (
          <button type="button" className="btn btn-gold btn-block press" onClick={onOutras}>Ver outras pesquisas abertas</button>
        )}
        <button type="button" className="btn btn-ink btn-block press" onClick={fechar}>Fechar</button>
        {fechou && <p className="mut" style={{ textAlign: 'center' }}>Pode fechar esta página.</p>}
      </div>
    </div>
  );
}
