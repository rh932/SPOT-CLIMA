'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/apiClient';
import {
  EVALUATION_DIMENSIONS, CLASSIFICATION_OPTIONS, CONCLUSION_OPTIONS,
  type RatingOption, type SubAnswerOption,
} from '@/data/evaluationBank';
import { EvaluationDimensionCard } from '@/components/gestor/EvaluationDimensionCard';
import { COLOR_OPTIONS, COLOR_INTERVAL_DAYS, COLOR_LABELS, nextFeedbackDate, type FeedbackColor } from '@/lib/feedbackCycle';
import { ActionButton, ErrorState, SkeletonForm, LiveStatus, useToast, ForbiddenState, ehSemAcesso } from '@/components/async';
import { scrollToFirstError } from '@/lib/scrollToError';
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
  sector: { name: string; usesColorCycle: boolean } | null;
  unit: { name: string } | null;
}

const formatDate = (value: string | Date) =>
  (typeof value === 'string' ? new Date(value) : value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

type Ratings = Record<string, RatingOption | null>;
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
  const [historico, setHistorico] = useState<{ period: PeriodoAvaliacao }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadForbidden, setLoadForbidden] = useState(false);

  // Hoje em São Paulo: depois das 21h o dia em UTC já é amanhã, e a avaliação
  // feita no último dia do contrato sairia como entregue fora do prazo.
  const [evaluationDate, setEvaluationDate] = useState(() => saoPauloIsoDate());
  const [ratings, setRatings] = useState<Ratings>(emptyRatings());
  const [subAnswers, setSubAnswers] = useState<SubAnswers>(emptySubAnswers());
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
  const { mostrar } = useToast();

  const carregar = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setLoadForbidden(false);
    apiFetch<{ employee: Employee; evaluations: { period: PeriodoAvaliacao }[]; canEvaluate: boolean; secondOpinion: SecondOpinion | null }>(`/api/gestor/employees/${params.id}`)
      .then((d) => { setEmployee(d.employee); setHistorico(d.evaluations ?? []); setCanEvaluate(d.canEvaluate); setSecondOpinion(d.secondOpinion); })
      .catch((e) => { setLoadForbidden(ehSemAcesso(e)); setLoadError(e instanceof Error ? e.message : 'Erro ao carregar.'); })
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => { carregar(); }, [carregar]);

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
      usesColorCycle: employee.sector?.usesColorCycle ?? false,
      evaluations: historico,
    }) ?? 'FEEDBACK';
  const isFeedback = period === 'FEEDBACK';
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

  const dimensionsIncomplete = EVALUATION_DIMENSIONS.filter(
    (d) => !ratings[d.key] || d.subQuestions.some((sq) => !subAnswers[d.key][sq.key]),
  );
  const finalIncomplete =
    !favorableAspects.trim() ||
    !unfavorableAspects.trim() ||
    !classification ||
    (!isFeedback && !conclusion) ||
    (needsColor && !color);
  const invalid = dimensionsIncomplete.length > 0 || finalIncomplete;

  const submit = async () => {
    if (invalid) {
      setAttempted(true);
      // O defeito que isto conserta: a ficha tem 8 dimensões e o botão fica no
      // rodapé. Marcar de vermelho uma dimensão lá em cima não aparece na tela
      // de quem clicou — e o gestor repetia o clique achando que travou.
      scrollToFirstError();
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
      for (const d of EVALUATION_DIMENSIONS) {
        payload[`${d.key}Rating`] = ratings[d.key];
        payload[`${d.key}SubAnswers`] = subAnswers[d.key];
      }
      await apiFetch(`/api/gestor/employees/${employee.id}/evaluate`, { method: 'POST', body: JSON.stringify(payload) });
      // Confirma e SEGURA o estado de envio: a navegação do App Router ainda
      // vai buscar a rota, e durante esses segundos a tela continua sendo esta.
      setEnviado(true);
      mostrar(`Avaliação de ${employee.fullName} registrada.`);
      router.push('/gestor');
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

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{employee.fullName}</h1>
        <p className="text-spot-gray-500 text-sm">
          {employee.roleDescription} · {employee.sector?.name} · {employee.unit?.name}
        </p>
        <p className="text-xs text-spot-gray-500 mt-1">
          {period === 'FIRST'
            ? '1º ciclo de experiência (45 dias)'
            : period === 'SECOND'
              ? '2º ciclo de experiência (90 dias)'
              : `Feedback periódico${employee.currentColor ? ` · classificação atual: ${COLOR_LABELS[employee.currentColor]}` : ''}`}
          {' — '}
          {isFeedback ? 'previsto para ' : 'vencimento '}
          {formatDate(dueDate)}
        </p>
      </div>

      {segunda && (
        <div className="card border-l-[3px] border-spot-yellow text-sm text-spot-gray-800 leading-relaxed">
          <p className="font-semibold">Segunda resposta deste período</p>
          <p className="mt-1">
            {segunda.firstEvaluator ?? 'Outro gestor'} avaliou em {formatDate(segunda.firstDate)}
            {segunda.firstConclusion && <> e concluiu <strong>{CONCLUSAO[segunda.firstConclusion]}</strong></>}.
            As duas respostas ficam na ficha, e a situação segue a avaliação com a data mais recente — avaliando com a data de hoje, se você concluir diferente, é a sua que passa a valer.
          </p>
        </div>
      )}

      <div className="card">
        <label className="block">
          <span className="label">Data desta avaliação</span>
          <input
            type="date"
            className="input max-w-xs"
            value={evaluationDate}
            onChange={(e) => setEvaluationDate(e.target.value)}
            // Mesma faixa que o servidor aceita: da admissão até hoje.
            min={employee.admissionDate ? String(employee.admissionDate).slice(0, 10) : undefined}
            max={saoPauloIsoDate()}
          />
        </label>
      </div>

      {EVALUATION_DIMENSIONS.map((d) => (
        <div
          key={d.key}
          data-erro={
            attempted && (!ratings[d.key] || d.subQuestions.some((sq) => !subAnswers[d.key][sq.key]))
              ? 'true'
              : undefined
          }
        >
        <EvaluationDimensionCard
          dimension={d}
          rating={ratings[d.key]}
          subAnswers={subAnswers[d.key]}
          onRatingChange={(v) => setRatings((prev) => ({ ...prev, [d.key]: v }))}
          onSubAnswerChange={(key, v) => setSubAnswers((prev) => ({ ...prev, [d.key]: { ...prev[d.key], [key]: v } }))}
          showError={attempted && (!ratings[d.key] || d.subQuestions.some((sq) => !subAnswers[d.key][sq.key]))}
        />
        </div>
      ))}

      <div className="card flex flex-col gap-4" data-erro={attempted && finalIncomplete ? 'true' : undefined}>
        <p className="font-display text-lg font-semibold text-spot-gray-900">Avaliação final</p>
        <div>
          <label className="block">
            <span className="label">Quais os aspectos MAIS favoráveis do funcionário?</span>
            <textarea className="input min-h-[90px] resize-y" value={favorableAspects} onChange={(e) => setFavorableAspects(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Quais os aspectos MENOS favoráveis do funcionário?</span>
            <textarea className="input min-h-[90px] resize-y" value={unfavorableAspects} onChange={(e) => setUnfavorableAspects(e.target.value)} />
          </label>
        </div>
        {/* <fieldset>/<legend> no lugar de um <label> solto: label rotula UM
            controle, e aqui sao varias opcoes. Sem o grupo, o leitor de tela
            anunciava "Promover, botao de opcao" sem nunca dizer a pergunta. */}
        <fieldset className="min-w-0 border-0 p-0 m-0">
          <legend className="label">De maneira geral, como o funcionário pode ser classificado:</legend>
          <div className="flex flex-col gap-2 mt-2">
            {CLASSIFICATION_OPTIONS.map((opt) => (
              <label key={opt.value} className={`flex items-center gap-2.5 min-h-11 rounded-lg border px-3.5 py-2.5 cursor-pointer transition ${classification === opt.value ? 'border-spot-black bg-spot-gray-50' : 'border-spot-gray-300 hover:border-spot-gray-500'}`}>
                <input type="radio" name="classification" className="accent-spot-black" checked={classification === opt.value} onChange={() => setClassification(opt.value)} />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {!isFeedback && (
          <fieldset className="min-w-0 border-0 p-0 m-0">
            <legend className="label">CONCLUSÃO</legend>
            <div className="flex flex-col gap-2 mt-2">
              {conclusionOptions.map((opt) => (
                <label key={opt.value} className={`flex items-center gap-2.5 min-h-11 rounded-lg border px-3.5 py-2.5 cursor-pointer transition ${conclusion === opt.value ? 'border-spot-black bg-spot-gray-50' : 'border-spot-gray-300 hover:border-spot-gray-500'}`}>
                  <input type="radio" name="conclusion" className="accent-spot-black" checked={conclusion === opt.value} onChange={() => setConclusion(opt.value)} />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {attempted && finalIncomplete && <p className="text-xs text-spot-danger">Preencha todos os campos da avaliação final.</p>}
      </div>

      <div className="card flex flex-col gap-4">
        <div>
          <p className="font-display text-lg font-semibold text-spot-gray-900">Desenvolvimento</p>
          <p className="text-xs text-spot-gray-500 mt-0.5">Opcional — alimenta o histórico e a indicação de treinamento.</p>
        </div>
        <div>
          <label className="block">
            <span className="label">Pontos de desenvolvimento</span>
            <textarea className="input min-h-[80px] resize-y" value={developmentPoints} onChange={(e) => setDevelopmentPoints(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Orientações dadas ao colaborador</span>
            <textarea className="input min-h-[80px] resize-y" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Necessidade de treinamento</span>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Ex.: precisa melhorar conhecimento sobre atendimento."
              value={trainingNeeds}
              onChange={(e) => setTrainingNeeds(e.target.value)}
            />
          </label>
        </div>
      </div>

      {needsColor && (
        <div className="card flex flex-col gap-4" data-erro={attempted && !color ? 'true' : undefined}>
          <div>
            <p className="font-display text-lg font-semibold text-spot-gray-900">Classificação por cor</p>
            <p className="text-xs text-spot-gray-500 mt-0.5">
              A cor define de quanto em quanto tempo {employee.fullName.split(' ')[0]} recebe o próximo feedback.
            </p>
          </div>
          <fieldset className="min-w-0 border-0 p-0 m-0 flex flex-col gap-2">
            <legend className="sr-only">Classificação por cor</legend>
            {COLOR_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 min-h-11 rounded-lg border px-3.5 py-2.5 cursor-pointer transition ${color === opt.value ? 'border-spot-black bg-spot-gray-50' : 'border-spot-gray-300 hover:border-spot-gray-500'}`}
              >
                <input type="radio" name="color" className="accent-spot-black mt-1" checked={color === opt.value} onChange={() => setColor(opt.value)} />
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`h-2.5 w-2.5 rounded-full ${opt.dotClassName}`} />
                    {opt.label}
                    <span className="text-xs font-normal text-spot-gray-500">a cada {COLOR_INTERVAL_DAYS[opt.value]} dias</span>
                  </span>
                  <span className="block text-xs text-spot-gray-500 mt-0.5">{opt.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {previewNextDate && (
            <p className="text-xs text-spot-gray-600">
              Próximo feedback será agendado para <strong>{previewNextDate.toLocaleDateString('pt-BR')}</strong>.
            </p>
          )}
          {employee.currentColor && color && color !== employee.currentColor && (
            <div>
              <label className="block">
                <span className="label">Por que a classificação mudou?</span>
                <textarea
                  className="input min-h-[70px] resize-y"
                  placeholder={`De ${COLOR_LABELS[employee.currentColor]} para ${COLOR_LABELS[color]} — registre o motivo.`}
                  value={colorReason}
                  onChange={(e) => setColorReason(e.target.value)}
                />
              </label>
            </div>
          )}
          {attempted && !color && <p className="text-xs text-spot-danger">Escolha a classificação por cor.</p>}
        </div>
      )}

      {submitError && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">
          {submitError}
        </p>
      )}
      {attempted && invalid && !submitError && (
        <p role="alert" className="text-sm text-spot-gray-800 bg-spot-white border-l-[3px] border-spot-warning px-3 py-2.5">
          Faltam campos obrigatórios
          {dimensionsIncomplete.length > 0 && ` em ${dimensionsIncomplete.length} dimensão(ões)`}
          . A tela levou você até o primeiro deles.
        </p>
      )}
      <ActionButton
        className="btn-primary w-full"
        pending={submitting || enviado}
        pendingLabel={enviado ? 'Enviada! Voltando ao painel...' : 'Enviando...'}
        onClick={submit}
      >
        Enviar avaliação
      </ActionButton>
    </div>
  );
}
