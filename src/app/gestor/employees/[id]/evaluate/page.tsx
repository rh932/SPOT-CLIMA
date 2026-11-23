'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/apiClient';
import {
  EVALUATION_DIMENSIONS, CLASSIFICATION_OPTIONS, CONCLUSION_OPTIONS, RATING_LABELS,
  type RatingOption, type SubAnswerOption,
} from '@/data/evaluationBank';
import { Ic } from '@/components/sp/Ic';
import { UniformeCard } from '@/components/gestor/UniformeCard';
import { PerguntasExtrasCard, type PerguntaExtra } from '@/components/gestor/PerguntasExtrasCard';
import { setorAvaliaUniforme } from '@/data/uniforme';
import { RoteiroPdiForm } from '@/components/gestor/RoteiroPdiForm';
import {
  CHAVES_ROTEIRO, unidadeUsaRoteiroPdi, dataRevisaoPdi, type PilarRoteiro, type PlanoRoteiro,
} from '@/data/roteiroPdi';
import { AvaliacaoPassos, type PassoLivre } from '@/components/gestor/AvaliacaoPassos';
import { AvaliacaoEnviada } from '@/components/gestor/AvaliacaoEnviada';
import { COLOR_OPTIONS, COLOR_INTERVAL_DAYS, COLOR_LABELS, nextFeedbackDate, feedbackOrdinalLabel, type FeedbackColor } from '@/lib/feedbackCycle';
import { FeedbacksAnteriores } from '@/components/gestor/FeedbacksAnteriores';
import type { EvaluationRecord } from '@/components/EvaluationCard';
import { ErrorState, SkeletonForm, LiveStatus, ForbiddenState, ehSemAcesso } from '@/components/async';
import { saoPauloIsoDate } from '@/lib/probation';
import { nextEvaluationPeriod, type PeriodoAvaliacao } from '@/lib/colorUnlock';

interface Employee {
  id: string;
  fullName: string;
  roleDescription: string;
  admissionDate: string;
  status: 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';
  period1DueDate: string;
  period2DueDate: string;
  currentColor: FeedbackColor | null;
  nextFeedbackDueDate: string | null;
  isApprentice?: boolean;
  track?: 'NOVO' | 'ATIVO';
  sector: { name: string; usesColorCycle: boolean } | null;
  unit: { name: string } | null;
}

const formatDate = (value: string | Date) =>
  (typeof value === 'string' ? new Date(value) : value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const RASCUNHO_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

type Ratings =Record<string, RatingOption | null>;
type SubAnswers = Record<string, Record<string, SubAnswerOption | null>>;

const emptyRatings = (): Ratings => Object.fromEntries(EVALUATION_DIMENSIONS.map((d) => [d.key, null]));
const emptySubAnswers = (): SubAnswers =>
  Object.fromEntries(EVALUATION_DIMENSIONS.map((d) => [d.key, Object.fromEntries(d.subQuestions.map((sq) => [sq.key, null]))]));

interface SecondOpinion {
  period: 'FIRST' | 'SECOND';
  until: string;
  firstEvaluator: string | null;
  firstConclusion: 'DEMITIR' | 'EFETIVAR' | 'EXTENDER' | null;
  firstDate: string;
}

const CONCLUSAO: Record<'DEMITIR' | 'EFETIVAR' | 'EXTENDER', string> = {
  EFETIVAR: 'efetivar', EXTENDER: 'prorrogar por +45 dias', DEMITIR: 'desligar',
};

/** useSearchParams exige um Suspense acima dele no App Router. */
export default function EvaluatePage() {
  return (
    <Suspense fallback={<SkeletonForm campos={5} />}>
      <EvaluateForm />
    </Suspense>
  );
}

function EvaluateForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  // ?segunda=1: segunda resposta do período que outro gestor acabou de avaliar.
  const querSegunda = useSearchParams().get('segunda') === '1';
  const [secondOpinion, setSecondOpinion] = useState<SecondOpinion | null>(null);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [historico, setHistorico] = useState<(EvaluationRecord & { period: PeriodoAvaliacao })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadForbidden, setLoadForbidden] = useState(false);

  // Hoje em São Paulo: depois das 21h o dia em UTC já é amanhã, e a avaliação
  // feita no último dia do contrato sairia como entregue fora do prazo.
  const [evaluationDate, setEvaluationDate] = useState(() => saoPauloIsoDate());
  const [ratings, setRatings] = useState<Ratings>(emptyRatings());
  const [subAnswers, setSubAnswers] = useState<SubAnswers>(emptySubAnswers());
  // Roteiro PDI (feedback de Paulista e JK): no lugar das 4 dimensões.
  const [notasRoteiro, setNotasRoteiro] = useState<Record<string, RatingOption | null>>({});
  const [obsRoteiro, setObsRoteiro] = useState<Partial<Record<PilarRoteiro['key'], string>>>({});
  const [planoRoteiro, setPlanoRoteiro] = useState<PlanoRoteiro>({ competencias: [], pratica: '', mentoria: '', estudo: '' });
  const [uniformRating, setUniformRating] = useState<RatingOption | null>(null);
  const [uniformNotes, setUniformNotes] = useState('');
  // Perguntas extras do setor (aprovadas pelo RH) e as respostas, por id da pergunta.
  const [customQuestions, setCustomQuestions] = useState<{ DESEMPENHO: PerguntaExtra[]; FEEDBACK: PerguntaExtra[] }>({ DESEMPENHO: [], FEEDBACK: [] });
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [favorableAspects, setFavorableAspects] = useState('');
  const [unfavorableAspects, setUnfavorableAspects] = useState('');
  const [classification, setClassification] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [color, setColor] = useState<FeedbackColor | ''>('');
  const [colorReason, setColorReason] = useState('');
  const [developmentPoints, setDevelopmentPoints] = useState('');
  const [guidance, setGuidance] = useState('');
  const [trainingNeeds, setTrainingNeeds] = useState('');
  const [canEvaluate, setCanEvaluate] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [takenBy, setTakenBy] = useState<string | null>(null);
  // Fica `true` do sucesso do POST até a navegação pintar. Sem isto, o
  // `finally` devolvia o botão ao normal assim que a resposta chegava e a tela
  // ficava parada no formulário durante a transição do App Router — parecia
  // que o envio não tinha funcionado.
  const [enviado, setEnviado] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setLoadForbidden(false);
    apiFetch<{ employee: Employee; evaluations: (EvaluationRecord & { period: PeriodoAvaliacao })[]; canEvaluate: boolean; secondOpinion: SecondOpinion | null; customQuestions?: { DESEMPENHO: PerguntaExtra[]; FEEDBACK: PerguntaExtra[] } }>(`/api/gestor/employees/${params.id}`)
      .then((d) => { setEmployee(d.employee); setHistorico(d.evaluations ?? []); setCanEvaluate(d.canEvaluate); setSecondOpinion(d.secondOpinion); setCustomQuestions(d.customQuestions ?? { DESEMPENHO: [], FEEDBACK: [] }); })
      .catch((e) => { setLoadForbidden(ehSemAcesso(e)); setLoadError(e instanceof Error ? e.message : 'Erro ao carregar.'); })
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Rascunho ───────────────────────────────────────────────────────────
  // A ficha tem ~40 respostas e textos; recarregar a página, perder a rede ou
  // a sessão expirar apagava tudo. O rascunho fica SÓ neste aparelho
  // (localStorage), por colaborador, some ao enviar e vence em 7 dias.
  const chaveRascunho = `spot_clima_rascunho_avaliacao_${params.id}${querSegunda ? '_2' : ''}`;
  const [rascunhoPronto, setRascunhoPronto] = useState(false);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);

  useEffect(() => {
    if (loading || !employee || rascunhoPronto) return;
    setRascunhoPronto(true);
    try {
      const bruto = localStorage.getItem(chaveRascunho);
      if (!bruto) return;
      const r = JSON.parse(bruto);
      if (!r || typeof r !== 'object' || Date.now() - Number(r.t) > RASCUNHO_VALIDADE_MS) {
        localStorage.removeItem(chaveRascunho);
        return;
      }
      const txt = (v: unknown) => (typeof v === 'string' ? v : '');
      if (r.ratings && typeof r.ratings === 'object') setRatings((p) => ({ ...p, ...(Object.fromEntries(Object.entries(r.ratings).filter(([k]) => k in p)) as Ratings) }));
      if (r.subAnswers && typeof r.subAnswers === 'object') {
        setSubAnswers((p) => Object.fromEntries(Object.entries(p).map(([dim, subs]) => [dim, { ...subs, ...(Object.fromEntries(Object.entries(r.subAnswers[dim] ?? {}).filter(([k]) => k in subs)) as Record<string, SubAnswerOption | null>) }])) as SubAnswers);
      }
      if (r.notasRoteiro && typeof r.notasRoteiro === 'object') setNotasRoteiro(r.notasRoteiro);
      if (r.obsRoteiro && typeof r.obsRoteiro === 'object') setObsRoteiro(r.obsRoteiro);
      if (r.planoRoteiro && typeof r.planoRoteiro === 'object') {
        setPlanoRoteiro({
          competencias: Array.isArray(r.planoRoteiro.competencias) ? r.planoRoteiro.competencias.filter((c: unknown) => typeof c === 'string') : [],
          pratica: txt(r.planoRoteiro.pratica), mentoria: txt(r.planoRoteiro.mentoria), estudo: txt(r.planoRoteiro.estudo),
        });
      }
      if (typeof r.uniformRating === 'string') setUniformRating(r.uniformRating as RatingOption);
      setUniformNotes(txt(r.uniformNotes));
      if (r.customAnswers && typeof r.customAnswers === 'object') setCustomAnswers(r.customAnswers);
      setFavorableAspects(txt(r.favorableAspects));
      setUnfavorableAspects(txt(r.unfavorableAspects));
      setClassification(txt(r.classification));
      setConclusion(txt(r.conclusion));
      setColor(txt(r.color) as FeedbackColor | '');
      setColorReason(txt(r.colorReason));
      setDevelopmentPoints(txt(r.developmentPoints));
      setGuidance(txt(r.guidance));
      setTrainingNeeds(txt(r.trainingNeeds));
      setRascunhoRestaurado(true);
    } catch {
      // Rascunho ilegível ou armazenamento indisponível: segue com a ficha em branco.
    }
  }, [loading, employee, rascunhoPronto, chaveRascunho]);

  useEffect(() => {
    if (!rascunhoPronto || enviado) return;
    const espera = setTimeout(() => {
      try {
        const temAlgo =
          Object.values(ratings).some(Boolean) || Object.values(subAnswers).some((s) => Object.values(s).some(Boolean)) ||
          Object.values(notasRoteiro).some(Boolean) || Object.values(obsRoteiro).some(Boolean) ||
          planoRoteiro.competencias.length > 0 || [planoRoteiro.pratica, planoRoteiro.mentoria, planoRoteiro.estudo].some((t) => t.trim()) ||
          uniformRating || uniformNotes.trim() || Object.values(customAnswers).some((t) => t.trim()) ||
          [favorableAspects, unfavorableAspects, classification, conclusion, color, colorReason, developmentPoints, guidance, trainingNeeds].some((t) => t.trim());
        if (!temAlgo) {
          localStorage.removeItem(chaveRascunho);
          return;
        }
        localStorage.setItem(chaveRascunho, JSON.stringify({
          t: Date.now(), ratings, subAnswers, notasRoteiro, obsRoteiro, planoRoteiro, uniformRating, uniformNotes,
          customAnswers, favorableAspects, unfavorableAspects, classification, conclusion, color, colorReason,
          developmentPoints, guidance, trainingNeeds,
        }));
      } catch {
        // Sem espaço ou em navegação privada: a ficha continua funcionando, só não guarda.
      }
    }, 600);
    return () => clearTimeout(espera);
  }, [
    rascunhoPronto, enviado, chaveRascunho, ratings, subAnswers, notasRoteiro, obsRoteiro, planoRoteiro, uniformRating,
    uniformNotes, customAnswers, favorableAspects, unfavorableAspects, classification, conclusion, color, colorReason,
    developmentPoints, guidance, trainingNeeds,
  ]);

  const descartarRascunho = () => {
    try { localStorage.removeItem(chaveRascunho); } catch { /* sem armazenamento */ }
    setRatings(emptyRatings());
    setSubAnswers(emptySubAnswers());
    setNotasRoteiro({});
    setObsRoteiro({});
    setPlanoRoteiro({ competencias: [], pratica: '', mentoria: '', estudo: '' });
    setUniformRating(null);
    setUniformNotes('');
    setCustomAnswers({});
    setFavorableAspects('');
    setUnfavorableAspects('');
    setClassification('');
    setConclusion('');
    setColor('');
    setColorReason('');
    setDevelopmentPoints('');
    setGuidance('');
    setTrainingNeeds('');
    setRascunhoRestaurado(false);
  };

  if (loading) {
    return (
      <div aria-busy="true">
        <LiveStatus>Carregando a ficha de avaliação...</LiveStatus>
        <SkeletonForm campos={5} />
      </div>
    );
  }
  if (loadError) return loadForbidden ? <ForbiddenState /> : <ErrorState message={loadError} onRetry={carregar} />;
  if (!employee) return null;

  // O servidor já recusa o POST; aqui é só para o Gestor Líder não encarar um
  // formulário que ele nunca vai conseguir enviar.
  if (!canEvaluate) {
    return (
      <div className="card text-center py-10">
        <p className="font-semibold mb-1">Somente o gestor do turno avalia.</p>
        <p className="text-sm text-spot-gray-500">
          Você acompanha o andamento de {employee.fullName}, mas a avaliação é preenchida pelo gestor responsável
          pelo turno dele.
        </p>
      </div>
    );
  }

  if (takenBy) {
    return (
      <div className="card text-center py-10 flex flex-col items-center gap-3">
        <p className="font-semibold">Avaliação já registrada.</p>
        <p className="text-sm text-spot-gray-500 max-w-sm">{takenBy}</p>
        <p className="text-xs text-spot-gray-500 max-w-sm">
          Se o setor tem dois gestores, o segundo também pode avaliar este período pela ficha do colaborador, em “Avaliar também”.
        </p>
        <button type="button" className="btn-primary mt-1" onClick={() => { router.push('/gestor'); router.refresh(); }}>
          Voltar ao painel
        </button>
      </div>
    );
  }

  if (querSegunda && !secondOpinion) {
    return (
      <div className="card text-center py-10 flex flex-col items-center gap-3">
        <p className="font-semibold">A segunda resposta não está mais aberta.</p>
        <p className="text-sm text-spot-gray-500 max-w-sm">
          Você já respondeu este período, o prazo passou, o próximo período já foi avaliado ou o RH registrou o desligamento.
        </p>
        <button type="button" className="btn-primary mt-1" onClick={() => router.push(`/gestor/employees/${employee.id}`)}>
          Voltar à ficha
        </button>
      </div>
    );
  }
  const segunda = querSegunda ? secondOpinion : null;

  if (employee.status === 'TERMINATED' && !segunda) {
    return (
      <div className="card text-center py-10">
        <p className="font-semibold mb-1">Colaborador desligado.</p>
        <p className="text-sm text-spot-gray-500">
          O histórico de {employee.fullName} continua disponível, mas ele não recebe novas avaliações.
        </p>
      </div>
    );
  }

  // Efetivado entra no ciclo permanente de feedback — mesmo formulário, sem
  // conclusão de experiência e com a classificação por cor no lugar dela.
  // Exceção: efetivado na 1ª avaliação num setor de cores ainda faz a 2ª
  // (colorUnlock.ts) — a mesma regra que a rota usa para decidir o período.
  const period = segunda
    ? segunda.period
    : nextEvaluationPeriod({
      status: employee.status,
      isApprentice: employee.isApprentice,
      currentColor: employee.currentColor,
      track: employee.track,
      usesColorCycle: employee.sector?.usesColorCycle ?? false,
      evaluations: historico,
    }) ?? 'FEEDBACK';
  const isFeedback = period === 'FEEDBACK';
  // Feedback e experiência têm contadores separados: o próximo feedback é o
  // maior número já gravado + 1 (a mesma conta que a rota faz ao salvar).
  const feedbacksAnteriores = historico.filter((h) => h.period === 'FEEDBACK');
  const numeroDoFeedback = Math.max(0, ...feedbacksAnteriores.map((h) => h.cycleNumber)) + 1;
  const dueDate =
    period === 'FIRST'
      ? employee.period1DueDate
      : period === 'SECOND'
        ? employee.period2DueDate
        : (employee.nextFeedbackDueDate ?? new Date().toISOString());
  const conclusionOptions = period === 'SECOND' ? CONCLUSION_OPTIONS.filter((c) => c.value !== 'EXTENDER') : CONCLUSION_OPTIONS;

  // O projeto de cores é do Salão: se o setor do colaborador não está no ciclo,
  // a classificação simplesmente não existe nesta tela — ele efetiva sem cor.
  // A regra de verdade está na rota (o setor é lido do banco); aqui é só a
  // interface acompanhar.
  const usaCores = employee.sector?.usesColorCycle ?? false;
  // A cor só aparece quando passa a valer: no feedback, e nos 90 dias assim que
  // o gestor marca EFETIVAR (é ela que agenda a primeira avaliação do ciclo).
  // Na segunda resposta, a cor só entra se o primeiro gestor ainda não a definiu.
  const needsColor = usaCores && (isFeedback || (period === 'SECOND' && conclusion === 'EFETIVAR' && (!segunda || !employee.currentColor)));
  const previewNextDate = color ? nextFeedbackDate(new Date(evaluationDate + 'T00:00:00'), color) : null;

  const usaRoteiro = isFeedback && unidadeUsaRoteiroPdi(employee.unit?.name);
  const usaUniforme = isFeedback && setorAvaliaUniforme(employee.sector?.name);
  const uniformeIncompleto = usaUniforme && !uniformRating;
  const perguntasExtras = customQuestions[isFeedback ? 'FEEDBACK' : 'DESEMPENHO'];
  const extrasIncompletas = perguntasExtras.some((p) => p.required && !(customAnswers[p.id] ?? '').trim());
  const roteiroIncompleto = usaRoteiro && CHAVES_ROTEIRO.some((k) => !notasRoteiro[k]);
  const dimensionsIncomplete = usaRoteiro ? [] : EVALUATION_DIMENSIONS.filter(
    (d) => !ratings[d.key] || d.subQuestions.some((sq) => !subAnswers[d.key][sq.key]),
  );
  const finalIncomplete =
    !favorableAspects.trim() ||
    !unfavorableAspects.trim() ||
    !classification ||
    (!isFeedback && !conclusion) ||
    (needsColor && !color);
  const invalid = dimensionsIncomplete.length > 0 || roteiroIncompleto || uniformeIncompleto || extrasIncompletas || finalIncomplete;

  const submit = async () => {
    if (invalid) {
      // A ficha em passos já leva a pessoa até a primeira pergunta que falta.
      setAttempted(true);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        evaluationDate: new Date(evaluationDate).toISOString(),
        dueDateAtEvaluation: new Date(dueDate).toISOString(),
        favorableAspects,
        unfavorableAspects,
        classification,
      };
      if (!isFeedback) payload.conclusion = conclusion;
      if (segunda) payload.secondOpinion = true;
      if (needsColor && color) {
        payload.color = color;
        if (colorReason.trim()) payload.colorReason = colorReason.trim();
      }
      if (developmentPoints.trim()) payload.developmentPoints = developmentPoints.trim();
      if (guidance.trim()) payload.guidance = guidance.trim();
      if (trainingNeeds.trim()) payload.trainingNeeds = trainingNeeds.trim();
      if (usaUniforme && uniformRating) {
        payload.uniformRating = uniformRating;
        if (uniformNotes.trim()) payload.uniformNotes = uniformNotes.trim();
      }
      if (perguntasExtras.length > 0) {
        payload.customAnswers = Object.fromEntries(
          perguntasExtras.map((p) => [p.id, (customAnswers[p.id] ?? '').trim()]).filter(([, v]) => v),
        );
      }
      if (usaRoteiro) {
        const observacoes = Object.fromEntries(
          Object.entries(obsRoteiro).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v),
        );
        payload.roteiro = {
          versao: 1,
          notas: notasRoteiro,
          plano: {
            competencias: planoRoteiro.competencias,
            pratica: planoRoteiro.pratica.trim(),
            mentoria: planoRoteiro.mentoria.trim(),
            estudo: planoRoteiro.estudo.trim(),
          },
          ...(Object.keys(observacoes).length > 0 ? { observacoes } : {}),
        };
      } else {
        for (const d of EVALUATION_DIMENSIONS) {
          payload[`${d.key}Rating`] = ratings[d.key];
          payload[`${d.key}SubAnswers`] = subAnswers[d.key];
        }
      }
      await apiFetch(`/api/gestor/employees/${employee.id}/evaluate`, { method: 'POST', body: JSON.stringify(payload) });
      // Confirma e SEGURA o estado de envio: a tela de "Avaliação enviada"
      // só aparece depois que o servidor respondeu OK.
      setEnviado(true);
      try { localStorage.removeItem(chaveRascunho); } catch { /* sem armazenamento */ }
      router.refresh();
      return;
    } catch (e) {
      // 409: outro gestor do mesmo setor/turno registrou esta avaliação antes.
      // Não é erro de preenchimento, então a tela para de pedir envio.
      if (e instanceof ApiClientError && e.status === 409) {
        setTakenBy(e.message);
        return;
      }
      setSubmitError(e instanceof Error ? e.message : 'Erro ao enviar avaliação.');
      setSubmitting(false);
    }
  };

  const primeiroNome = employee.fullName.split(' ')[0];
  const rotuloClassif = CLASSIFICATION_OPTIONS.find((o) => o.value === classification)?.label.replace(/\.$/, '') ?? '';
  const rotuloConclusao = CONCLUSION_OPTIONS.find((o) => o.value === conclusion)?.label.replace(/\.$/, '') ?? '';
  const texto = (v: string) => v.trim() || '';

  // Cada campo que a ficha já tinha vira uma tela. O conteúdo é o mesmo de
  // antes (mesmos campos, mesmas regras de obrigatório); só muda a ordem de
  // apresentação: uma coisa por vez.
  const grupoFinal = 'Avaliação final';
  const passos: PassoLivre[] = [];

  if (usaRoteiro) {
    passos.push({
      id: 'roteiro', grupo: 'Roteiro de feedback', kick: 'Roteiro de feedback', titulo: `Roteiro de feedback de ${primeiroNome}`,
      descricao: 'Dê uma nota a cada item e monte o plano de desenvolvimento.',
      completo: !roteiroIncompleto,
      resumo: [['Itens com nota', `${CHAVES_ROTEIRO.filter((k) => notasRoteiro[k]).length} de ${CHAVES_ROTEIRO.length}`]],
      node: (
        <RoteiroPdiForm
          notas={notasRoteiro}
          onNota={(k, v) => setNotasRoteiro((prev) => ({ ...prev, [k]: v }))}
          observacoes={obsRoteiro}
          onObservacao={(p, t) => setObsRoteiro((prev) => ({ ...prev, [p]: t }))}
          plano={planoRoteiro}
          onPlano={setPlanoRoteiro}
          revisaoEm={evaluationDate ? new Date(dataRevisaoPdi(evaluationDate) + 'T12:00:00').toLocaleDateString('pt-BR') : null}
          mostrarErro={attempted}
          primeiroNome={primeiroNome}
        />
      ),
    });
  }
  if (usaUniforme) {
    passos.push({
      id: 'uniforme', grupo: 'Uniforme', kick: 'Uniforme', titulo: 'Como está o uniforme?',
      completo: !uniformeIncompleto,
      resumo: [['Nota do uniforme', uniformRating ? RATING_LABELS[uniformRating] : ''], ['Observação', texto(uniformNotes)]],
      node: <UniformeCard rating={uniformRating} onRating={setUniformRating} notes={uniformNotes} onNotes={setUniformNotes} mostrarErro={attempted} />,
    });
  }
  if (perguntasExtras.length > 0) {
    passos.push({
      id: 'extras', grupo: 'Perguntas do setor', kick: 'Perguntas do setor', titulo: 'Perguntas do seu setor',
      descricao: 'Aprovadas pelo RH para este setor.',
      completo: !extrasIncompletas,
      resumo: perguntasExtras.map((q): [string, string] => [q.text, texto(customAnswers[q.id] ?? '')]),
      node: (
        <PerguntasExtrasCard
          perguntas={perguntasExtras}
          respostas={customAnswers}
          onResposta={(id, v) => setCustomAnswers((prev) => ({ ...prev, [id]: v }))}
          mostrarErro={attempted}
        />
      ),
    });
  }
  passos.push({
    id: 'fav', grupo: grupoFinal, kick: `${grupoFinal} · 1`, titulo: `Quais os aspectos MAIS favoráveis de ${primeiroNome}?`,
    completo: Boolean(favorableAspects.trim()),
    resumo: [['Aspectos mais favoráveis', texto(favorableAspects)]],
    node: (
      <label className="block">
        <span className="sr">Aspectos mais favoráveis do funcionário</span>
        <textarea className="input pass-area" value={favorableAspects} onChange={(e) => setFavorableAspects(e.target.value)} aria-invalid={attempted && !favorableAspects.trim() ? true : undefined} />
      </label>
    ),
  });
  passos.push({
    id: 'unf', grupo: grupoFinal, kick: `${grupoFinal} · 2`, titulo: `Quais os aspectos MENOS favoráveis de ${primeiroNome}?`,
    completo: Boolean(unfavorableAspects.trim()),
    resumo: [['Aspectos menos favoráveis', texto(unfavorableAspects)]],
    node: (
      <label className="block">
        <span className="sr">Aspectos menos favoráveis do funcionário</span>
        <textarea className="input pass-area" value={unfavorableAspects} onChange={(e) => setUnfavorableAspects(e.target.value)} aria-invalid={attempted && !unfavorableAspects.trim() ? true : undefined} />
      </label>
    ),
  });
  passos.push({
    id: 'classif', grupo: grupoFinal, kick: `${grupoFinal} · 3`, titulo: `De maneira geral, como ${primeiroNome} pode ser classificado?`,
    completo: Boolean(classification),
    resumo: [['Classificação', rotuloClassif]],
    node: (
      <fieldset className="min-w-0 border-0 p-0 m-0">
        <legend className="sr">De maneira geral, como o funcionário pode ser classificado</legend>
        <div className="pass-opts">
          {CLASSIFICATION_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" role="radio" aria-checked={classification === opt.value} className="opt" onClick={() => setClassification(opt.value)}>
              <span className="d"><Ic n="check" s={14} w={3.2} /></span>{opt.label}
            </button>
          ))}
        </div>
      </fieldset>
    ),
  });
  if (!isFeedback) {
    passos.push({
      id: 'conclusao', grupo: grupoFinal, kick: `${grupoFinal} · 4`, titulo: 'E a sua conclusão?',
      completo: Boolean(conclusion),
      resumo: [['Conclusão', rotuloConclusao]],
      node: (
        <fieldset className="min-w-0 border-0 p-0 m-0">
          <legend className="sr">Conclusão da avaliação</legend>
          <div className="pass-opts">
            {conclusionOptions.map((opt) => (
              <button key={opt.value} type="button" role="radio" aria-checked={conclusion === opt.value} className="opt" onClick={() => setConclusion(opt.value)}>
                <span className="d"><Ic n="check" s={14} w={3.2} /></span>{opt.label}
              </button>
            ))}
          </div>
        </fieldset>
      ),
    });
  }
  passos.push({
    id: 'desenv', grupo: 'Desenvolvimento', kick: 'Desenvolvimento · opcional', titulo: 'Quer registrar algo sobre o desenvolvimento?',
    descricao: 'Opcional. Alimenta o histórico e a indicação de treinamento.',
    opcional: true,
    completo: Boolean(developmentPoints.trim() || guidance.trim() || trainingNeeds.trim()),
    resumo: [['Pontos de desenvolvimento', texto(developmentPoints)], ['Orientações dadas', texto(guidance)], ['Necessidade de treinamento', texto(trainingNeeds)]],
    node: (
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="label">Pontos de desenvolvimento</span>
          <textarea className="input pass-area-p" value={developmentPoints} onChange={(e) => setDevelopmentPoints(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Orientações dadas ao colaborador</span>
          <textarea className="input pass-area-p" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Necessidade de treinamento</span>
          <textarea className="input pass-area-p" placeholder="Ex.: precisa melhorar conhecimento sobre atendimento." value={trainingNeeds} onChange={(e) => setTrainingNeeds(e.target.value)} />
        </label>
      </div>
    ),
  });
  if (needsColor) {
    passos.push({
      id: 'cor', grupo: 'Cor do feedback', kick: 'Classificação por cor', titulo: `Em qual cor ${primeiroNome} fica?`,
      descricao: `A cor define de quanto em quanto tempo ${primeiroNome} recebe o próximo feedback.`,
      completo: Boolean(color),
      resumo: [['Cor', color ? COLOR_LABELS[color] : ''], ['Motivo da mudança', texto(colorReason)]],
      node: (
        <div className="flex flex-col gap-4">
          <fieldset className="min-w-0 border-0 p-0 m-0">
            <legend className="sr">Classificação por cor</legend>
            <div className="pass-opts">
              {COLOR_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" role="radio" aria-checked={color === opt.value} className="opt opt-cor" onClick={() => setColor(opt.value)}>
                  <span className="d"><Ic n="check" s={14} w={3.2} /></span>
                  <span className="opt-corpo">
                    <span className="opt-linha">
                      <span aria-hidden className={`cor-ponto ${opt.dotClassName}`} />
                      <b>{opt.label}</b>
                      <span className="mut">a cada {COLOR_INTERVAL_DAYS[opt.value]} dias</span>
                    </span>
                    <span className="mut opt-desc">{opt.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          {previewNextDate && (
            <p className="mut">Próximo feedback será agendado para <strong>{previewNextDate.toLocaleDateString('pt-BR')}</strong>.</p>
          )}
          {employee.currentColor && color && color !== employee.currentColor && (
            <label className="block">
              <span className="label">Por que a classificação mudou?</span>
              <textarea
                className="input pass-area-p"
                placeholder={`De ${COLOR_LABELS[employee.currentColor]} para ${COLOR_LABELS[color]} — registre o motivo.`}
                value={colorReason}
                onChange={(e) => setColorReason(e.target.value)}
              />
            </label>
          )}
        </div>
      ),
    });
  }

  const periodoLabel = period === 'FIRST'
    ? '1º ciclo de experiência (45 dias)'
    : period === 'SECOND'
      ? '2º ciclo de experiência (90 dias)'
      : `${feedbackOrdinalLabel(numeroDoFeedback)}${employee.currentColor ? ` · classificação atual: ${COLOR_LABELS[employee.currentColor]}` : ''}`;

  if (enviado) {
    return (
      <AvaliacaoEnviada
        id={employee.id}
        nome={employee.fullName}
        periodoLabel={periodoLabel}
        resultado={isFeedback ? (color ? COLOR_LABELS[color] : 'Feedback') : rotuloConclusao}
        onVoltar={() => { router.push('/gestor'); router.refresh(); }}
        onProxima={(id) => { router.push(`/gestor/employees/${id}`); router.refresh(); }}
      />
    );
  }

  return (
    <AvaliacaoPassos
      nome={employee.fullName}
      primeiroNome={primeiroNome}
      cargoLinha={[employee.roleDescription, employee.sector?.name, employee.unit?.name].filter(Boolean).join(' · ')}
      periodoLabel={periodoLabel}
      prazoTexto={`${isFeedback ? 'previsto para ' : 'vencimento '}${formatDate(dueDate)}`}
      dimensoes={usaRoteiro ? [] : EVALUATION_DIMENSIONS}
      ratings={ratings}
      subAnswers={subAnswers}
      onRating={(dim, v) => setRatings((prev) => ({ ...prev, [dim]: v }))}
      onSub={(dim, key, v) => setSubAnswers((prev) => ({ ...prev, [dim]: { ...prev[dim], [key]: v } }))}
      evaluationDate={evaluationDate}
      onDate={setEvaluationDate}
      // Mesma faixa que o servidor aceita: da admissão até hoje.
      dataMin={employee.admissionDate ? String(employee.admissionDate).slice(0, 10) : undefined}
      dataMax={saoPauloIsoDate()}
      passos={passos}
      restaurado={rascunhoRestaurado}
      avisos={
        <>
          {isFeedback && <FeedbacksAnteriores feedbacks={feedbacksAnteriores} />}
          {rascunhoRestaurado && (
            <div role="status" className="aviso-card">
              <p>Retomamos o que você já tinha preenchido. O rascunho fica só neste aparelho.</p>
              <button type="button" className="btn btn-ghost" onClick={descartarRascunho}>Começar do zero</button>
            </div>
          )}
          {segunda && (
            <div className="aviso-card aviso-col">
              <p><b>Segunda resposta deste período</b></p>
              <p>
                {segunda.firstEvaluator ?? 'Outro gestor'} avaliou em {formatDate(segunda.firstDate)}
                {segunda.firstConclusion && <> e concluiu <strong>{CONCLUSAO[segunda.firstConclusion]}</strong></>}.
                As duas respostas ficam na ficha, e a situação segue a avaliação com a data mais recente — avaliando com a data de hoje, se você concluir diferente, é a sua que passa a valer.
              </p>
            </div>
          )}
        </>
      }
      veredito={
        isFeedback
          ? { rotulo: 'Classificação', valor: color ? COLOR_LABELS[color] : 'Feedback', selo: rotuloClassif || undefined }
          : { rotulo: 'Sua conclusão', valor: rotuloConclusao, selo: rotuloClassif || undefined }
      }
      enviando={submitting}
      erroEnvio={submitError}
      onEnviar={submit}
      onTentou={() => setAttempted(true)}
      onSair={() => router.push(`/gestor/employees/${employee.id}`)}
    />
  );
}
