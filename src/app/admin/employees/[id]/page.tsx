'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/apiClient';
import { EmployeeDeleteButton } from '@/components/EmployeeDeleteButton';
import { EvaluationCard, type EvaluationRecord } from '@/components/EvaluationCard';
import { pendingDueDate, dueBadge, statusLabel, type DueDateFields } from '@/lib/probation';
import { statusFromEvaluations, type TerminationReason } from '@/lib/termination';
import { TerminationSection, ApprenticeToggle } from './EmployeeStatusActions';
import {
  COLOR_OPTIONS, COLOR_LABELS, COLOR_INTERVAL_DAYS, feedbackStatusBadge, type FeedbackColor,
} from '@/lib/feedbackCycle';
import { awaitsSecondEvaluation, colorUnlocked } from '@/lib/colorUnlock';
import { ErrorState, LiveStatus, Skeleton, SkeletonCardList } from '@/components/async';

interface Employee extends DueDateFields {
  id: string;
  fullName: string;
  admissionDate: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  currentColor: FeedbackColor | null;
  nextFeedbackDueDate: string | null;
  sector: { name: string; usesColorCycle: boolean } | null;
  unit: { name: string } | null;
  terminationReason: TerminationReason | null;
  terminationDate: string | null;
  terminationNotes: string | null;
  previousStatus: DueDateFields['status'] | null;
}

const SHIFT_LABEL: Record<'DIA' | 'NOITE', string> = { DIA: 'Turno diurno', NOITE: 'Turno noturno' };

type Evaluation = EvaluationRecord;

interface ColorChange {
  id: string;
  previousColor: FeedbackColor | null;
  newColor: FeedbackColor;
  reason: string;
  nextDueDate: string;
  createdAt: string;
  changedBy: { name: string } | null;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });


export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [colorChanges, setColorChanges] = useState<ColorChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editandoAdmissao, setEditandoAdmissao] = useState(false);

  const load = useCallback(() =>
    Promise.all([
      apiFetch<{ employee: Employee; evaluations: Evaluation[] }>(`/api/admin/employees/${params.id}`)
        .then((d) => { setEmployee(d.employee); setEvaluations(d.evaluations); }),
      apiFetch<{ changes: ColorChange[] }>(`/api/admin/employees/${params.id}/color`)
        .then((d) => setColorChanges(d.changes)),
    ]), [params.id]);

  const carregar = useCallback(() => {
    setLoading(true);
    setError(null);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar a ficha.'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4 max-w-2xl">
        <LiveStatus>Carregando a ficha do colaborador...</LiveStatus>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3 max-w-[16rem]" />
          <Skeleton className="h-3 w-full max-w-[22rem]" />
        </div>
        <SkeletonCardList rows={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={carregar} />;
  if (!employee) return null;

  // A cor só é liberada depois da 2ª avaliação de experiência (colorUnlock.ts).
  // Efetivado na 1ª avaliação num setor de cores ainda deve a 2ª.
  const corInput = {
    status: employee.status, isApprentice: employee.isApprentice, currentColor: employee.currentColor,
    usesColorCycle: Boolean(employee.sector?.usesColorCycle), evaluations,
  };
  const corLiberada = colorUnlocked(corInput);
  const faltaSegunda = awaitsSecondEvaluation(corInput);
  const badge = dueBadge(faltaSegunda ? new Date(employee.period2DueDate) : pendingDueDate(employee));
  const colorOption = employee.currentColor ? COLOR_OPTIONS.find((c) => c.value === employee.currentColor) : null;
  const cycleBadge = feedbackStatusBadge({
    nextDueDate: employee.nextFeedbackDueDate ? new Date(employee.nextFeedbackDueDate) : null,
    completed: employee.status === 'TERMINATED',
  });

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">{employee.fullName}</h1>
        <p className="text-spot-gray-500 text-sm">
          {employee.roleDescription} · {employee.sector?.name} · {employee.unit?.name} · {SHIFT_LABEL[employee.shift]}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <p className="text-xs text-spot-gray-500">
            Admissão {formatDate(employee.admissionDate)} · Status: {statusLabel(employee)}
          </p>
          {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
        </div>
        {!employee.isApprentice && (
          <p className="text-xs text-spot-gray-500 mt-0.5">
            Fim do 1º contrato {formatDate(employee.period1DueDate)} · fim do 2º {formatDate(employee.period2DueDate)}
          </p>
        )}

        {/* Corrigir a admissão só faz sentido antes da primeira avaliação — a
            rota recusa depois disso, porque os prazos de 45/90 já valeram.
            É o conserto de quem foi cadastrado pelo treinador, cuja tela não
            pergunta a data e grava o dia do cadastro. */}
        {evaluations.length === 0 && employee.status !== 'TERMINATED' && (
          editandoAdmissao ? (
            <AdmissionDateForm
              employeeId={employee.id}
              current={employee.admissionDate}
              onClose={() => setEditandoAdmissao(false)}
              onSaved={async () => { setEditandoAdmissao(false); await load(); }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditandoAdmissao(true)}
              className="text-xs text-spot-gray-500 underline underline-offset-2 hover:text-spot-gray-900 transition mt-2"
            >
              Corrigir data de admissão
            </button>
          )
        )}
      </div>

      {/* O projeto de cores é do Salão: em setor fora do ciclo este bloco nem
          existe — lá o colaborador é efetivado sem cor e sem próximo feedback.
          Fica visível para efetivado sem cor dentro do ciclo, que é onde o RH
          classifica quem foi efetivado antes de o ciclo existir; e continua
          visível se já houver cor registrada, para o histórico não sumir caso
          o setor saia do ciclo depois. */}
      {!employee.isApprentice && (colorOption || (employee.status === 'HIRED' && employee.sector?.usesColorCycle)) && (
        <div className="card flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Ciclo de feedback</p>
          <div className="flex flex-wrap items-center gap-2">
            {colorOption ? (
              <>
                <span className={`badge ${colorOption.className} flex items-center gap-1.5`}>
                  <span className={`h-2 w-2 rounded-full ${colorOption.dotClassName}`} />
                  {COLOR_LABELS[colorOption.value]}
                </span>
                <span className="text-sm text-spot-gray-600">
                  feedback a cada {COLOR_INTERVAL_DAYS[colorOption.value]} dias
                </span>
              </>
            ) : corLiberada ? (
              <span className="text-sm text-spot-gray-500">
                Sem classificação — o ciclo de feedback começa quando uma cor for definida.
              </span>
            ) : (
              <span className="text-sm text-spot-gray-500">
                Classificação por cor bloqueada até a 2ª avaliação de experiência
                {faltaSegunda && <> (prevista para {formatDate(employee.period2DueDate)})</>}. A cor é definida nela.
              </span>
            )}
            {cycleBadge && <span className={`badge ${cycleBadge.className}`}>{cycleBadge.label}</span>}
          </div>
          {employee.nextFeedbackDueDate && employee.status !== 'TERMINATED' && (
            <p className="text-xs text-spot-gray-500">
              Próximo feedback previsto para {formatDate(employee.nextFeedbackDueDate)}.
            </p>
          )}

          {employee.status === 'HIRED' && !employee.isApprentice && employee.sector?.usesColorCycle && corLiberada && (
            <ColorChangeForm
              employeeId={employee.id}
              currentColor={employee.currentColor}
              onChanged={() => load()}
            />
          )}

          {colorChanges.length > 0 && (
            <div className="border-t border-spot-gray-100 pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-2">
                Mudanças de classificação
              </p>
              <div className="flex flex-col gap-2">
                {colorChanges.map((c) => (
                  <div key={c.id} className="text-xs text-spot-gray-600">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">
                        {c.previousColor ? `${COLOR_LABELS[c.previousColor]} → ${COLOR_LABELS[c.newColor]}` : `Classificado como ${COLOR_LABELS[c.newColor]}`}
                      </span>
                      <span className="text-spot-gray-500">
                        · {formatDate(c.createdAt)} · {c.changedBy?.name ?? '—'} · próximo em {formatDate(c.nextDueDate)}
                      </span>
                    </p>
                    <p className="text-spot-gray-500">{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <TerminationSection
        employee={employee}
        onChanged={load}
        // Desligado por "Demitir" na avaliação: o desligamento vem dela, não do RH.
        podeDesfazer={Boolean(employee.previousStatus) || statusFromEvaluations(evaluations.map((ev) => ({ period: ev.period, conclusion: ev.conclusion as 'DEMITIR' | 'EFETIVAR' | 'EXTENDER' | null, evaluationDate: ev.evaluationDate })), employee.isApprentice) !== 'TERMINATED'}
      />

      {evaluations.length === 0 ? (
        <div className="card text-center py-10 text-spot-gray-500">
          {employee.isApprentice ? 'Jovem aprendiz não passa pela avaliação de experiência.' : 'Nenhuma avaliação registrada ainda.'}
        </div>
      ) : (
        evaluations.map((ev) => <EvaluationCard key={ev.id} ev={ev} />)
      )}

      {/* Última coisa da página, e não um botão perdido no topo: quem chega
          aqui para excluir já rolou por cima do histórico que vai perder. */}
      <div className="border-t border-spot-gray-200 pt-5 mt-1">
        <ApprenticeToggle employee={employee} onChanged={load} />
        <p className="text-xs text-spot-gray-500 mb-2 mt-4">
          Cadastrou errado? A exclusão apaga o colaborador e todo o histórico dele.
        </p>
        <EmployeeDeleteButton
          employeeId={employee.id}
          employeeName={employee.fullName}
          apiBase="/api/admin/employees"
          onDeleted={() => { window.location.assign('/admin/employees'); }}
        />
      </div>
    </div>
  );
}

/**
 * Correção da classificação pelo RH. Fica fechado por padrão: o caminho normal
 * é a cor vir da avaliação do gestor, não daqui.
 */
function ColorChangeForm({
  employeeId, currentColor, onChanged,
}: { employeeId: string; currentColor: FeedbackColor | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState<FeedbackColor | ''>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setColor('');
    setReason('');
    setError(null);
  };

  const submit = async () => {
    if (!color || reason.trim().length < 3) {
      setError('Escolha a nova cor e escreva o motivo.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/employees/${employeeId}/color`, {
        method: 'POST',
        body: JSON.stringify({ color, reason: reason.trim() }),
      });
      close();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar a classificação.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-sm self-start py-2 px-4" onClick={() => setOpen(true)}>
        Alterar classificação
      </button>
    );
  }

  return (
    <div className="border-t border-spot-gray-100 pt-3 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.filter((c) => c.value !== currentColor).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setColor(opt.value)}
            className={`badge flex items-center gap-1.5 transition ${color === opt.value ? 'bg-spot-black text-spot-onBlack' : `${opt.className} hover:opacity-80`}`}
          >
            <span className={`h-2 w-2 rounded-full ${opt.dotClassName}`} />
            {COLOR_LABELS[opt.value]} · {COLOR_INTERVAL_DAYS[opt.value]} dias
          </button>
        ))}
      </div>
      <div>
        <label className="block">
          <span className="label">Motivo da mudança</span>
          <textarea
            className="input min-h-[70px] resize-y"
            aria-label="Motivo da mudança de classificação"
            placeholder="Por que a cadência deste colaborador está mudando fora de uma avaliação?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-spot-gray-500">
        {currentColor
          ? 'A nova data é contada a partir da última avaliação — mudar a cor ajusta a cadência, não zera o prazo.'
          : 'Como é a primeira classificação, o ciclo começa hoje.'}
      </p>
      {error && <p className="text-sm text-spot-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost text-sm py-2 px-4" onClick={close} disabled={saving}>Cancelar</button>
        <button type="button" className="btn-primary text-sm py-2 px-4" onClick={submit} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar classificação'}
        </button>
      </div>
    </div>
  );
}

/**
 * Correção da data de admissão, com os prazos de 45 e 90 dias recalculados
 * pela rota. Aparece só enquanto não há avaliação registrada.
 */
function AdmissionDateForm({
  employeeId, current, onClose, onSaved,
}: { employeeId: string; current: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(new Date(current).toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const salvar = async () => {
    if (!value) { setError('Informe a data.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/employees/${employeeId}`, {
        method: 'PATCH',
        // T12:00 evita que o fuso jogue a data para o dia anterior ao virar UTC.
        body: JSON.stringify({ admissionDate: new Date(`${value}T12:00:00`).toISOString() }),
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar a data.');
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 card flex flex-col gap-3 max-w-md">
      <div>
        <label className="label" htmlFor="admissao">Data de admissão</label>
        <input id="admissao" type="date" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        <p className="text-xs text-spot-gray-500 mt-1">Os prazos de 45 e 90 dias são recalculados a partir dela.</p>
      </div>
      {error && <p className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
      <div className="flex gap-3">
        <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="button" className="btn-primary flex-1" onClick={salvar} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
