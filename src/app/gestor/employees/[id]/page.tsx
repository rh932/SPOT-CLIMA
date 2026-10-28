'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { EmployeeDeleteButton } from '@/components/EmployeeDeleteButton';
import { dueBadge, pendingDueDate, statusLabel } from '@/lib/probation';
import {
  COLOR_OPTIONS, COLOR_LABELS, COLOR_INTERVAL_DAYS, colorChangePreview,
  daysBetween, feedbackStatusBadge, type FeedbackColor,
} from '@/lib/feedbackCycle';
import {
  buildEmployeeTimeline,
  type TimelineEvaluation, type TimelineColorChange, type TimelineTraining, type TimelineEvent,
} from '@/lib/employeeTimeline';
import { SHIFT_LABEL } from '../../useGestorEmployees';
import { awaitsSecondEvaluation, colorUnlocked } from '@/lib/colorUnlock';
import { EvaluationCard, type EvaluationRecord } from '@/components/EvaluationCard';
import { ErrorState, LiveStatus, Skeleton, SkeletonCardList, ForbiddenState, ehSemAcesso } from '@/components/async';

/**
 * Ficha do colaborador no portal da operação.
 *
 * É a tela que faltava: até aqui o gestor só via cards numa lista e ia direto
 * para o formulário de avaliação, sem nenhum lugar que contasse a história da
 * pessoa. Ela responde três perguntas, nesta ordem — o que está pendente
 * agora, em que cor ele está (e o que isso significa em dias), e o que já
 * aconteceu desde a admissão.
 *
 * Desenhada para celular: uma coluna, ações grandes, e a mudança de cor num
 * painel que sobe pela base, com prévia do efeito antes de confirmar.
 */

interface Employee {
  id: string;
  fullName: string;
  admissionDate: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  status: 'AWAITING_PERIOD_1' | 'AWAITING_PERIOD_2' | 'HIRED' | 'TERMINATED';
  isApprentice?: boolean;
  period1DueDate: string;
  period2DueDate: string;
  currentColor: FeedbackColor | null;
  nextFeedbackDueDate: string | null;
  sector: { id: string; name: string; usesColorCycle: boolean } | null;
  unit: { id: string; name: string } | null;
}

interface Payload {
  employee: Employee;
  evaluations: TimelineEvaluation[];
  colorChanges: TimelineColorChange[];
  trainings: TimelineTraining[];
  canEvaluate: boolean;
  canChangeColor: boolean;
  canDelete: boolean;
  secondOpinion: {
    period: 'FIRST' | 'SECOND';
    until: string;
    firstEvaluator: string | null;
    firstConclusion: 'DEMITIR' | 'EFETIVAR' | 'EXTENDER' | null;
    firstDate: string;
  } | null;
}

const CONCLUSAO: Record<'DEMITIR' | 'EFETIVAR' | 'EXTENDER', string> = {
  EFETIVAR: 'efetivar', EXTENDER: 'prorrogar por +45 dias', DEMITIR: 'desligar',
};

const formatDate = (value: string | Date) =>
  (typeof value === 'string' ? new Date(value) : value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/** "hoje", "em 12 dias", "há 3 dias" — mais legível que uma data solta. */
function prazoEmPalavras(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  return days > 0 ? `em ${days} dias` : `há ${Math.abs(days)} dias`;
}

const KIND_STYLE: Record<TimelineEvent['kind'], { dot: string; label: string }> = {
  ADMISSAO: { dot: 'bg-spot-gray-400', label: 'Admissão' },
  AVALIACAO: { dot: 'bg-spot-black', label: 'Avaliação' },
  COR: { dot: 'bg-spot-yellow', label: 'Classificação' },
  // Fora da paleta do projeto (era sky-500); o cinza medio distingue sem
  // introduzir uma sexta cor so para este marcador.
  TREINAMENTO: { dot: 'bg-spot-gray-600', label: 'Treinamento' },
};

export default function EmployeeFilePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadForbidden, setLoadForbidden] = useState(false);
  const [mudandoCor, setMudandoCor] = useState(false);

  const load = useCallback(
    () => apiFetch<Payload>(`/api/gestor/employees/${params.id}`).then(setData),
    [params.id],
  );

  const carregar = useCallback(() => {
    setLoading(true);
    setError(null);
    setLoadForbidden(false);
    load()
      .catch((e) => { setLoadForbidden(ehSemAcesso(e)); setError(e instanceof Error ? e.message : 'Erro ao carregar a ficha.'); })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <LiveStatus>Carregando a ficha do colaborador...</LiveStatus>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3 max-w-[16rem]" />
          <Skeleton className="h-3 w-full max-w-[22rem]" />
        </div>
        <SkeletonCardList rows={3} />
      </div>
    );
  }
  if (error) return (
    <div className="flex flex-col gap-4">
      {loadForbidden ? <ForbiddenState /> : <ErrorState message={error} onRetry={carregar} />}
      <Link href="/gestor" className="btn-ghost self-start">Voltar ao painel</Link>
    </div>
  );
  if (!data) return null;

  const { employee: e, canEvaluate, canChangeColor, canDelete } = data;
  const usaCores = e.sector?.usesColorCycle ?? false;
  // Efetivado na 1ª avaliação num setor de cores: a 2ª avaliação de
  // experiência continua devida, e a cor só é liberada depois dela.
  const corInput = {
    status: e.status, isApprentice: e.isApprentice, currentColor: e.currentColor,
    usesColorCycle: usaCores, evaluations: data.evaluations,
  };
  const faltaSegunda = awaitsSecondEvaluation(corInput);
  const corLiberada = colorUnlocked(corInput);
  const emExperiencia = e.status === 'AWAITING_PERIOD_1' || e.status === 'AWAITING_PERIOD_2' || faltaSegunda;
  // Efetivado com data marcada só conta como ciclo aberto se o setor participa
  // do projeto de cores — ver isFeedbackCycle() em useGestorEmployees.
  const noCicloDeFeedback = !faltaSegunda && e.status === 'HIRED' && !e.isApprentice && usaCores && Boolean(e.nextFeedbackDueDate);

  const prazoAberto = faltaSegunda
    ? new Date(e.period2DueDate)
    : emExperiencia
      ? pendingDueDate(e)
      : (noCicloDeFeedback ? new Date(e.nextFeedbackDueDate!) : null);
  const diasParaPrazo = prazoAberto ? daysBetween(new Date(), prazoAberto) : null;
  const badgePrazo = emExperiencia
    ? dueBadge(prazoAberto)
    : feedbackStatusBadge({ nextDueDate: prazoAberto, completed: e.status === 'TERMINATED' });

  const colorOption = e.currentColor ? COLOR_OPTIONS.find((c) => c.value === e.currentColor) ?? null : null;
  const timeline = buildEmployeeTimeline({
    admissionDate: e.admissionDate,
    evaluations: data.evaluations,
    colorChanges: data.colorChanges,
    trainings: data.trainings,
  });

  return (
    <div className="flex flex-col gap-5">
      <Link href="/gestor" className="text-sm text-spot-gray-500 hover:text-spot-gray-900 transition self-start">
        ← Voltar para a lista
      </Link>

      <header>
        <h1 className="titulo-pagina">{e.fullName}</h1>
        <p className="text-spot-gray-500 text-sm mt-0.5">
          {e.roleDescription} · {e.sector?.name} · {e.unit?.name} · {SHIFT_LABEL[e.shift]}
        </p>
        <p className="text-xs text-spot-gray-500 mt-1">
          {statusLabel(e)} · admitido em {formatDate(e.admissionDate)}
        </p>
      </header>

      {/* 1. O que está pendente agora — a primeira coisa que o gestor precisa ver. */}
      <section className="card flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">
            {faltaSegunda ? '2ª avaliação de experiência' : emExperiencia ? 'Próxima avaliação' : noCicloDeFeedback ? 'Próximo feedback' : 'Situação'}
          </p>
          {badgePrazo && <span className={`badge ${badgePrazo.className}`}>{badgePrazo.label}</span>}
        </div>

        {prazoAberto ? (
          <p className="font-sans text-2xl font-extrabold tracking-tight leading-snug">
            {formatDate(prazoAberto)}
            <span className="text-spot-gray-500 font-normal text-base"> — {prazoEmPalavras(diasParaPrazo!)}</span>
          </p>
        ) : (
          <p className="text-sm text-spot-gray-600">
            {e.status === 'TERMINATED'
              ? 'Colaborador desligado — o ciclo foi encerrado.'
              : e.isApprentice
                ? 'Jovem aprendiz: contrato de aprendizagem, sem avaliação de experiência nem ciclo de feedback.'
              : usaCores
                ? 'Sem próximo feedback agendado.'
                : `Efetivado. O setor ${e.sector?.name ?? ''} não participa do projeto de cores, então não há ciclo de feedback.`}
          </p>
        )}

        {canEvaluate && prazoAberto && e.status !== 'TERMINATED' && (
          <Link href={`/gestor/employees/${e.id}/evaluate`} className="btn-primary w-full">
            {emExperiencia ? 'Fazer a avaliação' : 'Registrar o feedback'}
          </Link>
        )}
        {!canEvaluate && prazoAberto && e.status !== 'TERMINATED' && (
          <p className="text-xs text-spot-gray-500">Quem preenche a avaliação é o gestor responsável pelo turno.</p>
        )}
      </section>

      {/* Setor com dois gestores: o outro já respondeu este período. */}
      {data.secondOpinion && (
        <section className="card flex flex-col gap-3 border-l-[3px] border-spot-yellow">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">
            Segunda resposta · {data.secondOpinion.period === 'FIRST' ? '1º' : '2º'} período
          </p>
          <p className="text-sm text-spot-gray-800 leading-relaxed">
            {data.secondOpinion.firstEvaluator ?? 'Outro gestor'} avaliou em {formatDate(data.secondOpinion.firstDate)}
            {data.secondOpinion.firstConclusion && <> e concluiu <strong>{CONCLUSAO[data.secondOpinion.firstConclusion]}</strong></>}.
            {' '}Você também pode avaliar este período até {formatDate(data.secondOpinion.until)}.
          </p>
          <p className="text-xs text-spot-gray-500">
            As duas respostas ficam na ficha. A situação segue a avaliação com a data mais recente.
          </p>
          <Link href={`/gestor/employees/${e.id}/evaluate?segunda=1`} className="btn-ghost w-full">
            Avaliar também o {data.secondOpinion.period === 'FIRST' ? '1º' : '2º'} período
          </Link>
        </section>
      )}

      {/* 2. A cor — o que ela significa em dias e como mudar. */}
      {usaCores && e.status === 'HIRED' && !e.isApprentice && (
        <section className="card flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Classificação por cor</p>

          {colorOption ? (
            <div className="flex items-center gap-3">
              <span aria-hidden className={`h-10 w-10 rounded-full shrink-0 ${colorOption.dotClassName}`} />
              <div className="min-w-0">
                <p className="font-semibold">{COLOR_LABELS[colorOption.value]}</p>
                <p className="text-sm text-spot-gray-600">
                  Feedback a cada {COLOR_INTERVAL_DAYS[colorOption.value]} dias
                </p>
              </div>
            </div>
          ) : corLiberada ? (
            <p className="text-sm text-spot-gray-600">
              Ainda sem classificação. Defina uma cor para o ciclo de feedback começar.
            </p>
          ) : null}

          {!corLiberada && (
            <p className="text-xs text-spot-gray-500">
              Bloqueada até a 2ª avaliação de experiência (90 dias). A cor é definida nela e, a partir daí, fica
              liberada para este colaborador.
            </p>
          )}
          {canChangeColor && corLiberada && (
            <button type="button" className="btn-ghost w-full" onClick={() => setMudandoCor(true)}>
              {colorOption ? 'Mudar a classificação' : 'Classificar agora'}
            </button>
          )}
          {!canChangeColor && corLiberada && (
            <p className="text-xs text-spot-gray-500">
              Só o gestor, o gestor líder e o RH mudam a classificação.
            </p>
          )}
        </section>
      )}

      {/* 3. A história da pessoa. */}
      <section className="card flex flex-col gap-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Linha do tempo</p>
        <ol className="flex flex-col">
          {timeline.map((ev, i) => (
            <li key={ev.id} className="flex gap-3">
              {/* Trilho: ponto do evento e a linha que liga ao próximo. */}
              <div className="flex flex-col items-center shrink-0 pt-1.5">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${KIND_STYLE[ev.kind].dot}`} />
                {i < timeline.length - 1 && <span aria-hidden className="w-px flex-1 bg-spot-gray-200 my-1" />}
              </div>
              <div className={`min-w-0 ${i < timeline.length - 1 ? 'pb-5' : ''}`}>
                <p className="text-xs text-spot-gray-500">
                  {formatDate(ev.date)} · {KIND_STYLE[ev.kind].label}
                </p>
                <p className="font-semibold text-sm leading-snug">{ev.title}</p>
                {ev.detail && <p className="text-sm text-spot-gray-600 leading-snug">{ev.detail}</p>}
                {ev.author && <p className="text-xs text-spot-gray-500 mt-0.5">por {ev.author}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. Histórico permanente: cada avaliação com tudo o que foi registrado
          nela. Avaliações novas entram aqui sem apagar as anteriores. */}
      {data.evaluations.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">
            Avaliações registradas · {data.evaluations.length}
          </p>
          {[...(data.evaluations as unknown as EvaluationRecord[])]
            .sort((a, b) => new Date(b.evaluationDate).getTime() - new Date(a.evaluationDate).getTime())
            .map((ev) => <div key={ev.id} id={`avaliacao-${ev.id}`} className="scroll-mt-20"><EvaluationCard ev={ev} /></div>)}
        </section>
      )}

      {canDelete && (
        <div className="border-t border-spot-gray-200 pt-4">
          <p className="text-xs text-spot-gray-500 mb-2">
            Cadastrou errado? A exclusão apaga o colaborador e todo o histórico dele.
          </p>
          <EmployeeDeleteButton
            employeeId={e.id}
            employeeName={e.fullName}
            apiBase="/api/gestor/employees"
            onDeleted={() => { window.location.assign('/gestor'); }}
          />
        </div>
      )}

      {mudandoCor && (
        <ColorSheet
          employee={e}
          lastEvaluationDate={
            data.evaluations.length > 0
              ? new Date(data.evaluations[data.evaluations.length - 1].evaluationDate)
              : null
          }
          onClose={() => setMudandoCor(false)}
          onSaved={async () => { setMudandoCor(false); await load(); }}
        />
      )}
    </div>
  );
}

/**
 * Painel de mudança de cor, subindo pela base — o mesmo gesto do login.
 *
 * A prévia é o ponto: antes de confirmar, a tela diz qual será a nova data e
 * se isso adianta ou adia o feedback. Sem ela, "trocar para verde" é uma
 * escolha às cegas de 135 dias a mais.
 */
function ColorSheet({
  employee, lastEvaluationDate, onClose, onSaved,
}: {
  employee: Employee;
  lastEvaluationDate: Date | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [color, setColor] = useState<FeedbackColor | ''>('');
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ja fechava no Esc; o que faltava era o foco — entrar no painel, nao
  // escapar para a ficha atras e voltar ao botao que abriu.
  const painelRef = usePainelModal<HTMLDivElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const preview = color
    ? colorChangePreview({
      newColor: color,
      currentColor: employee.currentColor,
      lastEvaluationDate,
      currentDueDate: employee.nextFeedbackDueDate ? new Date(employee.nextFeedbackDueDate) : null,
    })
    : null;

  const motivoCurto = reason.trim().length < 3;
  const invalid = !color || motivoCurto;

  const salvar = async () => {
    if (invalid) { setAttempted(true); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/gestor/employees/${employee.id}/color`, {
        method: 'POST',
        body: JSON.stringify({ color, reason: reason.trim() }),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível mudar a classificação.');
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/45 animate-fadeIn" onClick={() => !saving && onClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mudar a classificação por cor"
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center animate-sheetUp"
      >
        <div
          ref={painelRef}
          className="w-full sm:max-w-md bg-spot-white rounded-t-xl2 max-h-[92vh] overflow-y-auto shadow-[0_-8px_40px_rgba(0,0,0,0.25)]"
        >
          <div className="sticky top-0 bg-spot-white rounded-t-xl2 pt-3 px-5 sm:px-7">
            <span aria-hidden className="mx-auto block h-1.5 w-12 rounded-full bg-spot-gray-300" />
            <div className="flex items-start justify-between gap-4 pt-4">
              <div className="min-w-0">
                <h2 className="font-sans text-xl font-extrabold tracking-tight leading-tight">Classificação por cor</h2>
                <p className="text-xs text-spot-gray-500 mt-0.5 truncate">{employee.fullName}</p>
              </div>
              {/* O nome diz o EFEITO, nao o desenho: quem fecha aqui perde a
                 escolha de cor que acabou de fazer. */}
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Fechar sem mudar a classificação"
                className="shrink-0 rounded-btn border border-spot-gray-300 h-11 w-11 flex items-center justify-center text-spot-gray-600 transition-colors hover:bg-spot-gray-100 hover:text-spot-gray-900"
              >
                <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
              </button>
            </div>
            <span aria-hidden className="mt-3 block h-[2px] w-full bg-spot-black" />
          </div>

          <div className="px-5 sm:px-7 pt-5 pb-7 flex flex-col gap-4">
            <p className="text-sm text-spot-gray-600 leading-relaxed">
              A cor define de quantos em quantos dias este colaborador recebe feedback.
            </p>

            <div className="flex flex-col gap-2">
              {COLOR_OPTIONS.map((opt) => {
                const atual = opt.value === employee.currentColor;
                const ativo = color === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 rounded-btn border px-4 py-3 transition ${
                      atual
                        ? 'border-spot-gray-200 bg-spot-gray-50 opacity-60 cursor-not-allowed'
                        : ativo
                          ? 'border-spot-black bg-spot-gray-50 cursor-pointer'
                          : 'border-spot-gray-300 hover:border-spot-gray-500 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="nova-cor"
                      className="sr-only"
                      disabled={atual}
                      checked={ativo}
                      onChange={() => setColor(opt.value)}
                    />
                    <span aria-hidden className={`h-6 w-6 rounded-full shrink-0 mt-0.5 ${opt.dotClassName}`} />
                    <span className="min-w-0">
                      <span className="font-semibold text-sm block">
                        {opt.label}
                        {atual && <span className="text-spot-gray-500 font-normal"> — classificação atual</span>}
                      </span>
                      <span className="text-xs text-spot-gray-600 block leading-snug">{opt.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {attempted && !color && <p className="text-xs text-spot-danger">Escolha a nova classificação.</p>}

            {/* Prévia: o que muda no prazo, antes de confirmar. */}
            {preview && (
              <div className="rounded-btn bg-spot-gray-50 border border-spot-gray-200 px-4 py-3 text-sm">
                <p className="font-semibold">
                  Próximo feedback: {formatDate(preview.nextDueDate)}
                </p>
                <p className="text-spot-gray-600 text-xs mt-0.5">
                  {prazoEmPalavras(preview.daysFromToday)}
                  {preview.shiftInDays !== null && preview.shiftInDays !== 0 && (
                    preview.shiftInDays < 0
                      ? ` · antecipa ${Math.abs(preview.shiftInDays)} dias`
                      : ` · adia ${preview.shiftInDays} dias`
                  )}
                </p>
                {employee.currentColor && (
                  <p className="text-spot-gray-500 text-xs mt-1.5 leading-snug">
                    A contagem parte da última avaliação, não de hoje — mudar a cor ajusta a cadência sem zerar o prazo.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="label" htmlFor="motivo-cor">Motivo da mudança</label>
              <textarea
                id="motivo-cor"
                className="input min-h-[90px]"
                aria-label="Motivo da mudança de classificação"
                placeholder="O que mudou no desempenho ou na postura dele?"
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
              />
              <p className="text-xs text-spot-gray-500 mt-1">
                Fica registrado na ficha, com o seu nome — é o que explica a mudança de cadência depois.
              </p>
              {attempted && motivoCurto && <p className="text-xs text-spot-danger mt-1">Descreva o motivo da mudança.</p>}
            </div>

            {error && <p className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" className="btn-ghost sm:flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="button" className="btn-primary sm:flex-1" onClick={salvar} disabled={saving}>
                {saving ? 'Salvando...' : 'Confirmar mudança'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
