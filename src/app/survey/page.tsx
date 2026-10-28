'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { SurveyCover, CoverButton } from '@/components/survey/SurveyCover';
import { ProgressBar } from '@/components/ProgressBar';
import { QuestionField, type AnswerValue, type QuestionData } from '@/components/survey/QuestionField';
import { LiveStatus, Skeleton, Spinner } from '@/components/async';
import { scrollToFirstError } from '@/lib/scrollToError';
import { formatAccessCode, isAccessCodeFormat, parseAccessCodeHash } from '@/lib/accessCodeFormat';

// 'submitting' saiu: o envio agora acontece DENTRO da tela de revisão, com o
// botão carregando o estado, em vez de trocar a tela inteira por uma frase.
type Stage = 'loading' | 'no-survey' | 'select' | 'intro' | 'codigo' | 'sector' | 'unit' | 'questions' | 'review' | 'done' | 'error';

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

export default function SurveyPage() {
  const [stage, setStage] = useState<Stage>('loading');
  const [openSurveys, setOpenSurveys] = useState<OpenSurvey[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [data, setData] = useState<SurveyDetail | null>(null);
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [attemptedNext, setAttemptedNext] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /**
   * Qual pesquisa está abrindo.
   *
   * Antes a escolha trocava a tela inteira por "Carregando pesquisa...": o
   * colaborador perdia de vista o que tinha acabado de tocar e, numa rede
   * ruim, ficava olhando uma tela branca sem saber se acertou o botão. Agora o
   * próprio cartao mostra que está abrindo e os outros ficam desabilitados.
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
  const [depoisDoCodigo, setDepoisDoCodigo] = useState<'sector' | 'review'>('sector');

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

  const selectSurvey = async (surveyId: string) => {
    setAbrindoId(surveyId);
    try {
      const res = await fetch(`/api/public/surveys/${surveyId}`);
      if (!res.ok) throw new Error('not found');
      const d: SurveyDetail = await res.json();
      setData(d);
      setSectorId(null);
      setUnitId(null);
      setPageIndex(0);
      setAnswers({});
      setAttemptedNext(false);
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

  const pages = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; order: number; questions: QuestionData[] }>();
    for (const q of data.questions) {
      const key = q.dimension?.id ?? 'sem-dimensao';
      const entry = map.get(key) ?? { name: q.dimension?.name ?? 'Outras perguntas', order: q.dimension?.order ?? 999, questions: [] };
      entry.questions.push(q);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [data]);

  if (stage === 'loading') {
    // Esqueleto com a forma da capa: é a primeira tela que o colaborador vê,
    // vinda de um QR code na parede, e "Carregando pesquisa..." numa página
    // branca é o que faz a pessoa fechar e não voltar.
    return (
      <div className="min-h-dvh flex items-center justify-center bg-spot-cream px-4 py-10" aria-busy="true">
        <LiveStatus>Carregando a pesquisa...</LiveStatus>
        <div className="w-full max-w-lg card flex flex-col gap-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="h-px bg-spot-gray-200 my-2" />
          <Skeleton className="h-14 w-full rounded-xl2" />
          <Skeleton className="h-14 w-full rounded-xl2" />
        </div>
      </div>
    );
  }

  if (stage === 'no-survey') {
    return (
      <SurveyCover
        key="no-survey"
        title="Nenhuma pesquisa aberta"
        description="No momento não há nenhuma pesquisa disponível para responder. Quando o RH publicar a próxima, o link continua sendo este mesmo."
        aside={<>Se você recebeu um aviso de que há uma pesquisa em andamento e mesmo assim está vendo esta tela, fale com o RH.</>}
      />
    );
  }

  if (stage === 'error') {
    // Sem saída, esta tela prendia o colaborador: nem recarregava, nem voltava
    // para a lista. Agora ela oferece as duas ações — é a tela que mais gente
    // de fora do sistema pode ver, e ninguém vai depurar nada pelo celular.
    return (
      <CenteredMessage key="error">
        <p className="text-lg font-semibold mb-2 text-spot-gray-900">Não foi possível carregar a pesquisa.</p>
        <p className="text-spot-gray-500 text-sm mb-5">
          Pode ter sido uma falha momentânea de conexão. Tente de novo; se continuar, avise o RH.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary w-full" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
          {openSurveys.length > 0 && (
            <button type="button" className="btn-ghost w-full" onClick={backToSelection}>
              Voltar para a lista de pesquisas
            </button>
          )}
        </div>
      </CenteredMessage>
    );
  }

  if (stage === 'select') {
    const allAnswered = openSurveys.every((s) => answeredIds.has(s.id));
    return (
      <SurveyCover
        key="select"
        title="Pesquisas abertas"
        description={allAnswered
          ? 'Você já respondeu todas as pesquisas disponíveis. Obrigado por participar.'
          // "ao lado" só era verdade no computador: no celular a lista fica
          // embaixo, e a instrução mandava olhar para um lugar que não existe.
          : 'Escolha a pesquisa que deseja responder. Cada uma leva poucos minutos e as respostas são sempre anônimas.'}
        aside={
          <>
            <strong className="block text-spot-gray-900 mb-2">Escolha a pesquisa</strong>
            <div className="flex flex-col gap-3 mt-3">
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
                    className={`rounded-xl2 border px-5 py-4 text-left transition ${
                      answered
                        ? 'border-spot-gray-200 bg-spot-gray-50 opacity-60 cursor-not-allowed'
                        : abrindo
                          ? 'border-spot-black bg-spot-gray-50'
                          : 'border-spot-gray-300 bg-spot-white hover:border-spot-black active:scale-[0.98] disabled:opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{s.name}</p>
                      {abrindo && (
                        <span className="flex items-center gap-2 text-xs text-spot-gray-500 shrink-0">
                          <Spinner className="h-3 w-3" />
                          Abrindo...
                        </span>
                      )}
                      {answered && (
                        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-spot-gray-500 shrink-0">
                          Já respondida
                        </span>
                      )}
                    </div>
                    {/* Resumida: com várias pesquisas abertas, a descrição
                        inteira empurraria o botão de escolha para fora da tela. */}
                    {s.description && <p className="text-sm text-spot-gray-500 mt-1 line-clamp-2">{s.description}</p>}
                  </button>
                );
              })}
            </div>
          </>
        }
      />
    );
  }

  if (!data?.survey) return null;

  if (stage === 'intro') {
    return (
      <SurveyCover
        key="intro"
        title={data.survey.name}
        description={
          data.survey.description
            ? data.survey.description
            : 'Queremos ouvir você. Esta pesquisa foi criada para entender melhor sua experiência de trabalho no Spot. Os resultados são analisados de forma consolidada e orientam as ações de melhoria do dia a dia.'
        }
        aside={
          <>
            <strong className="block text-spot-gray-900 mb-2">Esta pesquisa é anônima.</strong>
            Suas respostas serão analisadas de forma consolidada e nenhuma resposta individual será associada ao seu
            nome. Não coletamos nome, e-mail, matrícula ou qualquer outro dado que possa te identificar — apenas o
            setor e a unidade em que você trabalha.
            {data.survey.requireAccessCode && (
              <span className="block mt-3">
                <strong className="text-spot-gray-900">Tenha em mãos o código de participação</strong> que você recebeu
                no papel. Ele vale uma resposta e não fica ligado a você nem às suas respostas.
              </span>
            )}
          </>
        }
        action={
          <CoverButton onClick={() => setStage(data.survey.requireAccessCode && !ticket ? 'codigo' : 'sector')}>
            Começar Pesquisa
          </CoverButton>
        }
        footer={
          openSurveys.length > 1 ? (
            <button className="mx-auto text-xs text-spot-gray-500 hover:text-spot-gray-600" onClick={backToSelection}>
              ← Ver outras pesquisas abertas
            </button>
          ) : undefined
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

    return (
      <CenteredMessage key="codigo" wide>
        <h2 className="font-display text-3xl font-normal tracking-tight mb-1">Código de participação</h2>
        <p className="text-spot-gray-500 text-sm mb-6">
          {depoisDoCodigo === 'review'
            ? 'Precisamos do código de novo para enviar. As suas respostas continuam guardadas.'
            : 'Digite o código do papel que você recebeu. Ele vale uma resposta e não fica ligado a você nem às suas respostas.'}
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            conferir();
          }}
        >
          <label className="label" htmlFor="codigo-participacao">Código</label>
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
            className={`input text-center text-lg tracking-[0.2em] uppercase ${codigoErro ? 'border-spot-danger' : ''}`}
            value={accessCode}
            onChange={(e) => {
              setAccessCode(e.target.value);
              setCodigoErro(null);
            }}
          />
          <p
            id="codigo-dica"
            role={codigoErro ? 'alert' : undefined}
            className={`text-xs mt-1 mb-6 ${codigoErro ? 'text-spot-danger' : 'text-spot-gray-500'}`}
          >
            {codigoErro ?? 'São 8 letras e números, como ABCD-EFGH. Quem leu o QR do papel já recebe o código preenchido.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-ghost"
              disabled={conferindoCodigo}
              onClick={() => setStage(depoisDoCodigo === 'review' ? 'questions' : 'intro')}
            >
              Voltar
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={conferindoCodigo} aria-busy={conferindoCodigo || undefined}>
              {conferindoCodigo && <Spinner />}
              {conferindoCodigo ? 'Conferindo...' : 'Continuar'}
            </button>
          </div>
        </form>
      </CenteredMessage>
    );
  }

  if (stage === 'sector') {
    return (
      <CenteredMessage key="sector" wide>
        <h2 className="font-display text-3xl font-normal tracking-tight mb-1">Qual é o seu setor?</h2>
        <p className="text-spot-gray-500 text-sm mb-6">
          Usamos apenas o setor e a unidade para organizar os resultados — sua resposta continua anônima.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {data.sectors.map((s) => (
            <button
              key={s.id}
              onClick={() => setSectorId(s.id)}
              className={`rounded-xl2 border px-4 py-4 text-left font-medium transition active:scale-[0.98] ${
                sectorId === s.id ? 'border-spot-black bg-spot-gray-50' : 'border-spot-gray-300 hover:border-spot-gray-500'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button className="btn-ghost" onClick={() => setStage('intro')}>
            Voltar
          </button>
          <button className="btn-primary flex-1" disabled={!sectorId} onClick={() => setStage('unit')}>
            Continuar
          </button>
        </div>
      </CenteredMessage>
    );
  }

  if (stage === 'unit') {
    return (
      <CenteredMessage key="unit" wide>
        <h2 className="font-display text-3xl font-normal tracking-tight mb-1">Qual é a sua unidade?</h2>
        <p className="text-spot-gray-500 text-sm mb-6">
          A loja/unidade em que você trabalha — sua resposta continua anônima.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {data.units.map((u) => (
            <button
              key={u.id}
              onClick={() => setUnitId(u.id)}
              className={`rounded-xl2 border px-4 py-4 text-left font-medium transition active:scale-[0.98] ${
                unitId === u.id ? 'border-spot-black bg-spot-gray-50' : 'border-spot-gray-300 hover:border-spot-gray-500'
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button className="btn-ghost" onClick={() => setStage('sector')}>
            Voltar
          </button>
          <button className="btn-primary flex-1" disabled={!unitId} onClick={() => setStage('questions')}>
            Continuar
          </button>
        </div>
      </CenteredMessage>
    );
  }

  if (stage === 'questions') {
    const page = pages[pageIndex];
    if (!page) return null;
    const missingRequired = page.questions.filter((q) => q.required && !isAnswered(answers[q.id]));

    const goNext = () => {
      if (missingRequired.length > 0) {
        setAttemptedNext(true);
        // O botão vive numa barra fixa no rodapé; a pergunta em branco pode
        // estar bem acima. Sem rolar até ela, tocar em "Próximo" não mudava
        // nada visível e a pessoa achava que a pesquisa tinha travado.
        scrollToFirstError();
        return;
      }
      setAttemptedNext(false);
      if (pageIndex < pages.length - 1) {
        setPageIndex((i) => i + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setStage('review');
      }
    };

    const goBack = () => {
      setAttemptedNext(false);
      if (pageIndex === 0) {
        setStage('unit');
      } else {
        setPageIndex((i) => i - 1);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
      <div key={pageIndex} className="max-w-2xl mx-auto px-4 py-8 sm:py-12 pb-28 animate-fadeInUp">
        <div className="mb-6">
          <ProgressBar current={pageIndex + 1} total={pages.length} />
        </div>
        <h2 className="font-display text-3xl font-normal tracking-tight mb-5 text-spot-gray-900">{page.name}</h2>
        <div className="flex flex-col gap-4 mb-8">
          {page.questions.map((q) => (
            <div
              key={q.id}
              data-erro={attemptedNext && q.required && !isAnswered(answers[q.id]) ? 'true' : undefined}
            >
              <QuestionField
                question={q}
                value={answers[q.id]}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                showError={attemptedNext && q.required && !isAnswered(answers[q.id])}
              />
            </div>
          ))}
        </div>
        <div className="fixed bottom-0 inset-x-0 bg-spot-cream border-t border-spot-gray-200 p-4 print:hidden">
          <div className="max-w-2xl mx-auto flex flex-col gap-2">
            {attemptedNext && missingRequired.length > 0 && (
              <p role="alert" className="text-xs text-spot-danger">
                {missingRequired.length === 1
                  ? 'Falta 1 pergunta obrigatória nesta página.'
                  : `Faltam ${missingRequired.length} perguntas obrigatórias nesta página.`}
              </p>
            )}
            <div className="flex gap-3">
              <button className="btn-ghost" onClick={goBack}>
                Anterior
              </button>
              <button className="btn-primary flex-1" onClick={goNext}>
                {pageIndex < pages.length - 1 ? 'Próximo' : 'Revisar e finalizar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'review') {
    const answeredCount = Object.keys(answers).length;
    /**
     * Envia SEM trocar a tela.
     *
     * Antes o envio levava a um 'submitting' em tela cheia: some o resumo,
     * some o botão, e numa falha a pessoa voltava para uma tela que parecia
     * outra. Agora o botão carrega o próprio estado e o contexto fica.
     */
    const exigeCodigo = Boolean(data.survey.requireAccessCode);
    const surveyId = data.survey.id;
    const pedirCodigoDeNovo = (motivo: string | null) => {
      saveTicket(surveyId, null);
      setTicket(null);
      setCodigoErro(motivo);
      setDepoisDoCodigo('review');
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
      <CenteredMessage key="review" wide>
        <h2 className="font-display text-3xl font-normal tracking-tight mb-3">Pronto para enviar?</h2>
        <p className="text-spot-gray-600 text-sm mb-6">
          Você está prestes a enviar sua pesquisa. Suas respostas serão registradas de forma anônima e não poderão
          ser alteradas depois do envio. Você respondeu {answeredCount} de {data.questions.length} perguntas.
        </p>
        {submitError && (
          <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5 mb-4">
            {submitError} As suas respostas continuam aqui — pode tentar de novo.
          </p>
        )}
        <div className="flex gap-3">
          <button className="btn-ghost" onClick={() => setStage('questions')} disabled={enviando}>
            Revisar respostas
          </button>
          <button className="btn-primary flex-1" onClick={submit} disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <Spinner />}
            {enviando ? 'Enviando...' : 'Finalizar pesquisa'}
          </button>
        </div>
      </CenteredMessage>
    );
  }

  if (stage === 'done') {
    return (
      <CenteredMessage key="done" wide>
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-spot-yellow flex items-center justify-center text-spot-onYellow animate-checkPop">
            <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h2 className="font-display text-4xl font-light tracking-tight mb-2">Obrigado por participar.</h2>
          <p className="text-spot-gray-600 text-sm">Suas respostas foram registradas de forma anônima.</p>
          {openSurveys.length > 1 && (
            <button className="btn-ghost mt-6" onClick={backToSelection}>
              Ver outras pesquisas abertas
            </button>
          )}
        </div>
      </CenteredMessage>
    );
  }

  return null;
}

function isAnswered(v: AnswerValue | undefined): boolean {
  if (!v) return false;
  if (v.numericValue !== undefined) return true;
  if (v.choiceValues && v.choiceValues.length > 0) return true;
  if (v.textValue && v.textValue.trim().length > 0) return true;
  return false;
}

function CenteredMessage({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-spot-cream px-4 py-10">
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-sm text-center text-spot-gray-500'} card animate-fadeInUp`}>
        {children}
      </div>
    </div>
  );
}
