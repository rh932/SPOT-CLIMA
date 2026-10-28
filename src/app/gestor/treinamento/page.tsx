'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncData, useToast,
} from '@/components/async';
import { scrollToFirstError } from '@/lib/scrollToError';
import { ChoiceGroup, ChoiceOption } from '@/components/forms/ChoiceGroup';
import { DAILY_RESULT_OPTIONS, FINAL_RESULT_OPTIONS, trainingResultLabel } from '@/lib/trainingResult';

interface TrainingMaterial {
  id: string;
  title: string;
  imageDataUri: string | null;
  instructions: string | null;
  order: number;
}
interface TrainingCriterion {
  id: string;
  label: string;
  hint: string | null;
  order: number;
  active: boolean;
}
interface RatingOption { value: string; label: string }
interface ContextField { key: string; label: string; type: 'text' | 'number' }
interface TrainingType {
  id: string;
  name: string;
  description: string | null;
  criteria: TrainingCriterion[];
  ratingOptions: RatingOption[] | null;
  contextFields: ContextField[] | null;
  positiveLabel: string | null;
  negativeLabel: string | null;
  materials: TrainingMaterial[];
}
interface EmployeeTraining {
  id: string;
  trainingTypeId: string;
  trainingDate: string;
  result: string;
  needsReinforcement: boolean;
  closure: 'DIA' | 'DEFINITIVO';
  trainingType: { id: string; name: string } | null;
}
interface Employee {
  id: string;
  fullName: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  admissionDate: string;
  sector: { id: string; name: string } | null;
  unit: { name: string } | null;
  trainings: EmployeeTraining[];
}

const SHIFT_LABEL: Record<'DIA' | 'NOITE', string> = { DIA: 'Diurno', NOITE: 'Noturno' };

interface Lookup { id: string; name: string }

/**
 * Nome da aba: a parte depois do último " - " ("Salão - Bar" → "Bar"). Todas
 * as abas são do Salão, então repetir o prefixo só ocupa espaço no celular.
 */
function nomeDaAba(setor: string): string {
  const partes = setor.split(' - ');
  return partes[partes.length - 1].trim() || setor;
}

export default function TreinamentoPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [aba, setAba] = useState<string | null>(null);
  const { mostrar } = useToast();

  const { data, loading, reloading, error: loadError, forbidden, reload } = useAsyncData(
    async (signal) => {
      const [emp, tipos] = await Promise.all([
        // `treinamento=1`: só os setores do treinamento (Salão). O servidor
        // aplica o mesmo recorte ao Treinador mesmo sem o parâmetro.
        apiFetch<{ employees: Employee[] }>('/api/gestor/employees?treinamento=1', { signal }),
        apiFetch<{ trainingTypes: TrainingType[] }>('/api/gestor/training-types', { signal }),
      ]);
      return { employees: emp.employees, types: tipos.trainingTypes };
    },
    [],
    { mensagemPadrao: 'Erro ao carregar os colaboradores.' },
  );
  const types = data?.types ?? [];

  const buscados = useMemo(() => {
    const employees = data?.employees ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      e.fullName.toLowerCase().includes(q)
      || e.roleDescription.toLowerCase().includes(q)
      || (e.sector?.name ?? '').toLowerCase().includes(q));
  }, [data, query]);

  /*
   * Uma aba por setor do treinamento que o treinador enxerga (ex.: Atendimento,
   * Bar, Gerente), na ordem em que aparecem — em vez de uma lista única e
   * comprida. A contagem de cada aba já respeita a busca, para mostrar onde
   * está quem foi procurado.
   */
  const abas = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string; total: number }>();
    for (const e of data?.employees ?? []) {
      if (e.sector && !mapa.has(e.sector.id)) mapa.set(e.sector.id, { id: e.sector.id, nome: nomeDaAba(e.sector.name), total: 0 });
    }
    for (const e of buscados) if (e.sector) mapa.get(e.sector.id)!.total += 1;
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data, buscados]);
  const abaAtual = abas.find((a) => a.id === aba) ?? abas[0] ?? null;
  const filtered = abas.length > 1 && abaAtual ? buscados.filter((e) => e.sector?.id === abaAtual.id) : buscados;

  if (selected) {
    return (
      <TrainingForm
        employee={selected}
        types={types}
        onCancel={() => setSelected(null)}
        /*
         * A ordem importa: confirma, DEPOIS recarrega. Antes a ficha fechava e
         * a lista voltava com o "último treinamento" antigo enquanto a recarga
         * corria em silêncio — o treinador não tinha como saber se gravou, e
         * registrava de novo. Agora sai a confirmação na hora e a faixa
         * "Atualizando" mostra que os dados estão vindo.
         */
        onDone={async (mensagem) => {
          setSelected(null);
          mostrar(mensagem);
          await reload();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Treinar colaborador</h1>
          <p className="text-spot-gray-500 text-sm">Escolha quem você vai treinar agora.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Cadastrar colaborador</button>
      </div>

      {/* O placeholder era o UNICO rotulo: some no primeiro caractere digitado
          e, para quem usa leitor de tela, o campo virava "edicao de texto" sem
          dizer que e a busca. O rotulo fica visualmente escondido porque o
          placeholder ja cumpre o papel visual. */}
      <label className="block">
        <span className="sr-only">Buscar colaborador por nome, cargo ou setor</span>
        <input
          type="search"
          className="input"
          placeholder="Buscar por nome, cargo ou setor..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {showCreate && (
        <CreateEmployeeModal
          onClose={() => setShowCreate(false)}
          onCreated={async (nome) => { setShowCreate(false); mostrar(`${nome} cadastrado.`); await reload(); }}
        />
      )}

      {!loading && !loadError && types.length === 0 && (
        <p className="text-sm bg-spot-white text-spot-gray-800 border-l-[3px] border-spot-warning px-4 py-3">
          Nenhum tipo de treinamento cadastrado ainda. Peça ao RH para cadastrar em Configurações.
        </p>
      )}

      {abas.length > 1 && (
        <div role="tablist" aria-label="Setores do treinamento" className="flex gap-1 overflow-x-auto border-b border-spot-gray-300 -mb-2">
          {abas.map((a) => {
            const ativa = abaAtual?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => setAba(a.id)}
                className={`shrink-0 min-h-11 px-4 -mb-px border-b-[3px] text-sm transition-colors ${
                  ativa ? 'border-spot-yellow font-semibold text-spot-gray-900' : 'border-transparent text-spot-gray-500 hover:text-spot-gray-900'
                }`}
              >
                {a.nome} <span className="font-mono text-[11px] text-spot-gray-500">{a.total}</span>
              </button>
            );
          })}
        </div>
      )}

      <RefreshingBar visible={reloading} texto="Atualizando a lista..." />

      <AsyncSection
        loading={loading}
        error={loadError}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="os colaboradores"
        skeleton={<SkeletonCardList rows={4} />}
        empty={filtered.length === 0}
        emptyState={
          <EmptyState>
            {query
              ? `Nenhum colaborador encontrado para esta busca${abas.length > 1 && abaAtual ? ` em ${abaAtual.nome}` : ''}.`
              : 'Nenhum colaborador dos setores do treinamento cadastrado ainda.'}
          </EmptyState>
        }
      >
      <div className="[&>*:last-child]:border-b-0 border-t border-spot-gray-300">
        {filtered.map((e, i) => {
          const ultimo = e.trainings[0];
          return (
            <button
              key={e.id}
              type="button"
              disabled={types.length === 0}
              onClick={() => setSelected(e)}
              className="group w-full flex items-center justify-between gap-4 text-left py-4 border-b border-spot-gray-200 transition-colors hover:bg-spot-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate group-hover:underline underline-offset-4 decoration-spot-yellow decoration-2">{e.fullName}</p>
                <p className="text-xs text-spot-gray-500 mt-0.5">
                  {e.roleDescription} · {e.sector?.name} · {e.unit?.name} · {SHIFT_LABEL[e.shift]}
                </p>
                <p className="text-xs text-spot-gray-500 mt-0.5">
                  {e.trainings.length === 0
                    ? 'Nenhum treinamento registrado'
                    : `${e.trainings.length} treinamento(s) · último: ${trainingResultLabel(ultimo.result, ultimo.closure)}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {e.trainings.some((t) => t.needsReinforcement) && (
                  <span className="badge badge-attention">Reforço pendente</span>
                )}
                {e.trainings.some((t) => t.closure === 'DEFINITIVO') && (
                  <span className="badge bg-spot-black text-spot-onBlack">Encerrado em definitivo</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      </AsyncSection>
    </div>
  );
}

/** Cadastro rápido feito pelo próprio treinador, dentro do escopo dele. */
function CreateEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (nome: string) => Promise<void> }) {
  const [sectors, setSectors] = useState<Lookup[]>([]);
  const [units, setUnits] = useState<Lookup[]>([]);
  const [shifts, setShifts] = useState<string[]>([]);
  const [fullName, setFullName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [shift, setShift] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Listas ainda chegando: os selects nascem desabilitados em vez de abrirem
  // vazios, o que parece "nao ha setor nenhum" quando e so a rede.
  const [carregandoListas, setCarregandoListas] = useState(true);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  useEffect(() => {
    apiFetch<{ sectors: Lookup[]; units: Lookup[]; shifts: string[] }>('/api/gestor/lookups')
      .then((d) => {
        setSectors(d.sectors);
        setUnits(d.units);
        setShifts(d.shifts);
        if (d.units.length === 1) setUnitId(d.units[0].id);
        if (d.shifts.length === 1) setShift(d.shifts[0]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar as listas.'))
      .finally(() => setCarregandoListas(false));
  }, []);

  const errors = {
    fullName: !fullName.trim() ? 'Informe o nome.' : undefined,
    roleDescription: !roleDescription.trim() ? 'Informe o cargo/função.' : undefined,
    sectorId: !sectorId ? 'Selecione o setor.' : undefined,
    unitId: !unitId ? 'Selecione a unidade.' : undefined,
    shift: !shift ? 'Selecione o turno.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (attempted ? errors[k] : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) { setAttempted(true); scrollToFirstError(); return; }
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/gestor/employees', {
        method: 'POST',
        // Sem data de admissão: a tela do treinador não pergunta isso. A rota
        // grava hoje, e o RH ajusta no painel se a pessoa entrou antes.
        body: JSON.stringify({ fullName, roleDescription, sectorId, unitId, shift }),
      });
      await onCreated(fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab seguia pelo conteudo coberto atras. */}
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Cadastrar colaborador"
        className="bg-spot-white w-full sm:max-w-lg rounded-t-xl2 sm:rounded-xl2 flex flex-col max-h-[92vh] modal-panel"
      >
        <div className="px-5 py-4 border-b border-spot-gray-200 shrink-0">
          <h2 className="font-display text-xl font-semibold">Cadastrar colaborador</h2>
          <p className="text-xs text-spot-gray-500 mt-0.5">
            Só aparecem as unidades e turnos do seu escopo. A admissão entra como hoje — se a pessoa entrou antes,
            o RH ajusta no painel.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div data-erro={show('fullName') ? 'true' : undefined}>
            <label className="block">
              <span className="label">Nome completo</span>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={saving} />
            </label>
            {show('fullName') && <p className="text-xs text-spot-danger mt-1">{errors.fullName}</p>}
          </div>
          <div data-erro={show('roleDescription') ? 'true' : undefined}>
            <label className="block">
              <span className="label">Cargo / função</span>
              <input className="input" value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} disabled={saving} />
            </label>
            {show('roleDescription') && <p className="text-xs text-spot-danger mt-1">{errors.roleDescription}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div data-erro={show('sectorId') ? 'true' : undefined}>
              <label className="block">
                <span className="label">Setor</span>
                <select className="input" value={sectorId} onChange={(e) => setSectorId(e.target.value)} disabled={carregandoListas || saving}>
                  <option value="">{carregandoListas ? 'Carregando...' : 'Selecione'}</option>
                  {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              {show('sectorId') && <p className="text-xs text-spot-danger mt-1">{errors.sectorId}</p>}
            </div>
            <div data-erro={show('unitId') ? 'true' : undefined}>
              <label className="block">
                <span className="label">Unidade</span>
                <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={carregandoListas || saving}>
                  <option value="">{carregandoListas ? 'Carregando...' : 'Selecione'}</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              {show('unitId') && <p className="text-xs text-spot-danger mt-1">{errors.unitId}</p>}
            </div>
          </div>
          <div data-erro={show('shift') ? 'true' : undefined}>
            <label className="block">
              <span className="label">Turno</span>
              <select className="input" value={shift} onChange={(e) => setShift(e.target.value)} disabled={carregandoListas || saving}>
                <option value="">{carregandoListas ? 'Carregando...' : 'Selecione'}</option>
                {shifts.map((s) => <option key={s} value={s}>{s === 'DIA' ? 'Diurno' : 'Noturno'}</option>)}
              </select>
            </label>
            {show('shift') && <p className="text-xs text-spot-danger mt-1">{errors.shift}</p>}
          </div>

          {error && <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-spot-gray-200 shrink-0 flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
          <ActionButton type="submit" className="btn-primary flex-1" pending={saving} pendingLabel="Salvando...">
            Cadastrar
          </ActionButton>
        </div>
      </form>
    </div>
  );
}

const DEFAULT_RATINGS: RatingOption[] = [
  { value: 'RUIM', label: 'Ruim' },
  { value: 'MEDIO', label: 'Médio' },
  { value: 'BOM', label: 'Bom' },
  { value: 'OTIMO', label: 'Ótimo' },
];

function TrainingForm({
  employee, types, onCancel, onDone,
}: { employee: Employee; types: TrainingType[]; onCancel: () => void; onDone: (mensagem: string) => Promise<void> }) {
  const [trainingTypeId, setTrainingTypeId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contextValues, setContextValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState('');
  // Apto / Não apto: escolhido só na confirmação do encerramento definitivo.
  const [finalResult, setFinalResult] = useState('');
  const [needsReinforcement, setNeedsReinforcement] = useState(false);
  const [reinforcementNotes, setReinforcementNotes] = useState('');
  const [positivePoints, setPositivePoints] = useState('');
  const [negativePoints, setNegativePoints] = useState('');
  const [observations, setObservations] = useState('');
  const [employeeFeedback, setEmployeeFeedback] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarDefinitivo, setConfirmarDefinitivo] = useState(false);
  const confirmacaoRef = usePainelModal<HTMLDivElement>({
    aberto: confirmarDefinitivo,
    aoFechar: () => setConfirmarDefinitivo(false),
    podeFechar: !saving,
  });

  const type = types.find((t) => t.id === trainingTypeId) ?? null;

  // Tipos já encerrados em definitivo para este colaborador não voltam a ser
  // selecionáveis — a rota recusa de qualquer forma, mas seria cruel deixar o
  // treinador preencher a ficha inteira para só então descobrir.
  const encerrados = new Map(
    employee.trainings
      .filter((t) => t.closure === 'DEFINITIVO')
      .map((t) => [t.trainingTypeId, t.trainingDate] as const),
  );
  const criteria = (type?.criteria ?? []).filter((c) => c.active).sort((a, b) => a.order - b.order);
  const ratingOptions = type?.ratingOptions?.length ? type.ratingOptions : DEFAULT_RATINGS;

  const missingType = !trainingTypeId;
  const missingResult = !result;
  const missingNotes = needsReinforcement && !reinforcementNotes.trim();
  const missingCriteria = criteria.filter((c) => !answers[c.id]);
  // O resultado da ficha do dia não vale para o definitivo, que pede Apto /
  // Não apto na confirmação — por isso fica fora da checagem comum.
  const invalidFicha = missingType || missingNotes || missingCriteria.length > 0;
  const invalid = invalidFicha || missingResult;

  // Trocar de formulário zera as respostas: os critérios são outros.
  const changeType = (id: string) => {
    setTrainingTypeId(id);
    setAnswers({});
    setContextValues({});
  };

  /**
   * `closure` decide se a ficha é mais um dia de treino ou o encerramento
   * daquele tipo para este colaborador — ver trainingClosureEnum no schema.
   * Quem valida de verdade é a rota; aqui é só o que o treinador escolheu.
   */
  const submit = async (closure: 'DIA' | 'DEFINITIVO') => {
    const definitivo = closure === 'DEFINITIVO';
    if (definitivo ? invalidFicha || !finalResult : invalid) {
      setAttempted(true);
      setConfirmarDefinitivo(false);
      // Sem isto, clicar em "Finalizar" com um item em branco so acendia um
      // aviso vermelho no alto da ficha. Quem clicou estava no rodape, no
      // celular: nada mudava na tela e o botao era apertado de novo.
      scrollToFirstError();
      return;
    }
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/gestor/trainings', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: employee.id,
          trainingTypeId,
          result: definitivo ? finalResult : result,
          answers,
          contextValues,
          needsReinforcement,
          reinforcementNotes: reinforcementNotes.trim() || undefined,
          positivePoints: positivePoints.trim() || undefined,
          negativePoints: negativePoints.trim() || undefined,
          observations: observations.trim() || undefined,
          employeeFeedback: employeeFeedback.trim() || undefined,
          closure,
        }),
      });
      await onDone(
        closure === 'DEFINITIVO'
          ? `Treinamento de ${employee.fullName} encerrado em definitivo.`
          : `Treinamento do dia de ${employee.fullName} registrado.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar o treinamento.');
      setConfirmarDefinitivo(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button className="text-sm text-spot-gray-500 hover:text-spot-gray-900 transition mb-3" onClick={onCancel}>
          ← Voltar para a lista
        </button>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">{employee.fullName}</h1>
        <p className="text-spot-gray-500 text-sm">
          {employee.roleDescription} · {employee.sector?.name} · {employee.unit?.name} · {SHIFT_LABEL[employee.shift]}
        </p>
      </div>

      <div className="card flex flex-col gap-4">
        <div data-erro={attempted && missingType ? 'true' : undefined}>
          <label className="block">
            <span className="label">Tipo de treinamento</span>
            <select className="input" value={trainingTypeId} onChange={(e) => changeType(e.target.value)} disabled={saving}>
              <option value="">Selecione</option>
              {types.map((t) => (
                <option key={t.id} value={t.id} disabled={encerrados.has(t.id)}>
                  {t.name}{encerrados.has(t.id) ? ' — encerrado em definitivo' : ''}
                </option>
              ))}
            </select>
          </label>
          {attempted && missingType && <p className="text-xs text-spot-danger mt-1">Selecione o tipo de treinamento.</p>}
          {type?.description && <p className="text-xs text-spot-gray-500 mt-2">{type.description}</p>}
        </div>

        {type && type.contextFields && type.contextFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-spot-gray-100 pt-4">
            {type.contextFields.map((f) => (
              <div key={f.key}>
                <label className="block">
                  <span className="label">{f.label}</span>
                  <input
                    className="input"
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={contextValues[f.key] ?? ''}
                    onChange={(e) => setContextValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {type && type.materials.length > 0 && (
          <div className="border-t border-spot-gray-100 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-2">Material de apoio</p>
            <div className="flex flex-col gap-3">
              {[...type.materials].sort((a, b) => a.order - b.order).map((m) => (
                <div key={m.id}>
                  <p className="text-sm font-medium">{m.title}</p>
                  {m.instructions && <p className="text-xs text-spot-gray-600 mt-0.5">{m.instructions}</p>}
                  {m.imageDataUri && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageDataUri} alt={m.title} className="mt-2 rounded-lg border border-spot-gray-200 max-w-full" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {type && criteria.length > 0 && (
        <div className="card flex flex-col gap-4">
          <div>
            <p className="font-semibold">Itens avaliados</p>
            <p className="text-xs text-spot-gray-500">Marque uma opção em cada item.</p>
          </div>

          <div className="flex flex-col divide-y divide-spot-gray-100">
            {criteria.map((c) => {
              const faltando = attempted && !answers[c.id];
              return (
                <div
                  key={c.id}
                  data-erro={faltando ? 'true' : undefined}
                  className={`py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${
                    faltando ? 'border-l-[3px] border-spot-danger -ml-3 pl-3' : ''
                  }`}
                >
                  {/* Um radiogroup por critério: as notas eram botões soltos e,
                      tabulando, ouvia-se "Ruim Médio Bom Ótimo" repetido sem
                      saber de qual item era cada série — nem qual estava
                      escolhida, já que o único sinal era o fundo amarelo. */}
                  <ChoiceGroup
                    className="contents"
                    invalido={faltando}
                    legenda={
                      <span className="min-w-0 sm:flex-1 block">
                        <span className="block text-sm font-semibold uppercase tracking-tight">{c.label}</span>
                        {c.hint && <span className="block text-xs text-spot-gray-500">{c.hint}</span>}
                      </span>
                    }
                  >
                  <div className="flex gap-1.5 shrink-0 flex-wrap">
                    {ratingOptions.map((o) => {
                      const active = answers[c.id] === o.value;
                      return (
                        <ChoiceOption
                          key={o.value}
                          name={`criterio-${c.id}`}
                          value={o.value}
                          checked={active}
                          onChange={() => setAnswers((a) => ({ ...a, [c.id]: o.value }))}
                          /* min-h-11: era 26px de altura, um quarto do alvo de
                             toque que o resto do app já adota. */
                          className={`flex items-center justify-center min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? 'bg-spot-yellow border-spot-yellow text-spot-onYellow'
                              : 'border-spot-gray-300 text-spot-gray-600 hover:border-spot-black'
                          }`}
                        >
                          {o.label}
                        </ChoiceOption>
                      );
                    })}
                  </div>
                  </ChoiceGroup>
                </div>
              );
            })}
          </div>

          {attempted && missingCriteria.length > 0 && (
            <p className="text-xs text-spot-danger">
              Faltam {missingCriteria.length} item(ns): {missingCriteria.map((c) => c.label).join(', ')}.
            </p>
          )}
        </div>
      )}

      {type && criteria.length === 0 && (
        <p className="text-sm bg-spot-white text-spot-gray-800 border-l-[3px] border-spot-warning px-4 py-3">
          O formulário deste tipo de treinamento ainda não foi configurado. Você pode registrar o resultado geral
          abaixo, e os itens avaliados entram quando o RH configurar.
        </p>
      )}

      <div className="card flex flex-col gap-4">
        <p className="font-semibold">Fechamento</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block">
              <span className="label">{type?.positiveLabel ?? 'Pontos positivos'}</span>
              <textarea
                className="input min-h-[90px]"
                value={positivePoints}
                onChange={(e) => setPositivePoints(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">{type?.negativeLabel ?? 'Pontos negativos'}</span>
              <textarea
                className="input min-h-[90px]"
                value={negativePoints}
                onChange={(e) => setNegativePoints(e.target.value)}
              />
            </label>
          </div>
        </div>

        <fieldset className="min-w-0 border-0 p-0 m-0" data-erro={attempted && missingResult ? 'true' : undefined}>
          <legend className="label">Resultado do dia</legend>
          <div className="flex flex-col gap-2">
            {DAILY_RESULT_OPTIONS.map((o) => (
              /* min-h-11: a area clicavel era so a altura do texto (~20px).
                 Com o <label> envolvendo o radio, crescer a area aqui torna a
                 linha inteira tocavel. */
              <label key={o.value} className="flex items-center gap-2 text-sm min-h-11">
                <input
                  type="radio"
                  name="result"
                  value={o.value}
                  checked={result === o.value}
                  onChange={(e) => setResult(e.target.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          {attempted && missingResult && <p className="text-xs text-spot-danger mt-1">Selecione o resultado do treinamento.</p>}
          <p className="text-xs text-spot-gray-500 mt-1">No encerramento definitivo você marca se o colaborador está Apto ou Não apto.</p>
        </fieldset>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={needsReinforcement} onChange={(e) => setNeedsReinforcement(e.target.checked)} />
            Precisa de reforço
          </label>
          {needsReinforcement && (
            <div className="mt-2" data-erro={attempted && missingNotes ? 'true' : undefined}>
              <label className="block">
                <span className="sr-only">O que precisa ser reforçado</span>
              <textarea
                className="input min-h-[80px]"
                placeholder="O que precisa ser reforçado?"
                value={reinforcementNotes}
                onChange={(e) => setReinforcementNotes(e.target.value)}
              />
              </label>
              {attempted && missingNotes && <p className="text-xs text-spot-danger mt-1">Descreva o que precisa de reforço.</p>}
            </div>
          )}
        </div>

        <div>
          <label className="block">
            <span className="label">Observações do treinador (opcional)</span>
            <textarea
              className="input min-h-[80px]"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </label>
        </div>

        <div>
          <label className="block">
            <span className="label">Sugestão ou crítica do colaborador (opcional)</span>
            <textarea
              className="input min-h-[80px]"
              placeholder="O que ele trouxe durante o treinamento."
              value={employeeFeedback}
              onChange={(e) => setEmployeeFeedback(e.target.value)}
            />
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}

        {/* Três saídas, como pedido: sair sem gravar, fechar o dia (o treino
            continua em outros dias) ou encerrar o tipo de vez. O encerramento
            definitivo passa por confirmação — é o único que não se desfaz
            sozinho depois. */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button className="btn-ghost sm:flex-1" onClick={onCancel} disabled={saving}>Cancelar</button>
          <ActionButton
            className="btn-primary sm:flex-1"
            pending={saving}
            pendingLabel="Registrando..."
            onClick={() => submit('DIA')}
          >
            Finalizar o treinamento do dia
          </ActionButton>
          <button
            className="btn-secondary sm:flex-1"
            disabled={saving}
            /* Valida ANTES de abrir a confirmação: pedir "tem certeza?" para
               depois recusar por campo em branco faz o treinador clicar duas
               vezes para descobrir o que faltava. */
            onClick={() => {
              if (invalidFicha) { setAttempted(true); scrollToFirstError(); return; }
              setConfirmarDefinitivo(true);
            }}
          >
            Finalizar o Treinamento Definitivo
          </button>
        </div>
        <p className="text-xs text-spot-gray-500">
          <strong>Treinamento do dia</strong> registra a ficha de hoje e mantém o treinamento aberto — dá para treinar
          de novo amanhã. <strong>Treinamento definitivo</strong> encerra este tipo de treinamento para este
          colaborador.
        </p>
      </div>

      {confirmarDefinitivo && (
        <div className="modal-overlay" onClick={() => !saving && setConfirmarDefinitivo(false)}>
          <div
            ref={confirmacaoRef}
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmar o encerramento definitivo do treinamento"
            className="modal-panel bg-spot-white w-full max-w-md rounded-xl2 p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-semibold">Finalizar o Treinamento Definitivo</h2>
            <p className="text-sm text-spot-gray-700 leading-relaxed">
              Atenção: ao finalizar o treinamento definitivo, o treinamento
              {type ? ` "${type.name}" ` : ' '}
              de <strong>{employee.fullName}</strong> será fechado e não poderá realizar mais alterações.
            </p>
            <p className="text-xs text-spot-gray-500">
              Depois disso, só o RH ou o Gestor Líder conseguem reabrir.
            </p>
            <fieldset className="min-w-0 border-0 p-0 m-0">
              <legend className="label">Resultado final</legend>
              <div className="flex flex-col gap-2">
                {FINAL_RESULT_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm min-h-11">
                    <input
                      type="radio"
                      name="finalResult"
                      value={o.value}
                      checked={finalResult === o.value}
                      onChange={(e) => setFinalResult(e.target.value)}
                      disabled={saving}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
            <div className="flex flex-col sm:flex-row gap-3">
              <button className="btn-ghost sm:flex-1" onClick={() => setConfirmarDefinitivo(false)} disabled={saving}>
                Voltar
              </button>
              <ActionButton
                className="btn-secondary sm:flex-1"
                pending={saving}
                pendingLabel="Encerrando..."
                disabled={!finalResult}
                onClick={() => submit('DEFINITIVO')}
              >
                Encerrar em definitivo
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
