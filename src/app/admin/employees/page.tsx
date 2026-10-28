'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePainelModal } from '@/components/forms/usePainelModal';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import {
  ActionButton, AsyncSection, EmptyState, RefreshingBar, SkeletonCardList,
  useAsyncData, useToast,
} from '@/components/async';
import { pendingDueDate, dueBadge, statusLabel, type DueDateFields } from '@/lib/probation';
import { CONSULTA_PARAM_KEYS, type ReportEmployeeInput } from '@/lib/experienceReport';
import { separarAcompanhamento, faseDo } from '@/lib/employeeGroups';
import { ConsultaAvancada } from './ConsultaAvancada';
import { LembrarGestores } from './LembrarGestores';
import {
  COLOR_OPTIONS, COLOR_LABELS, COLOR_INTERVAL_DAYS, feedbackStatusBadge, type FeedbackColor,
} from '@/lib/feedbackCycle';

interface Lookup { id: string; name: string; }
interface SectorLookup extends Lookup { inEvaluation: boolean; }
interface Employee extends DueDateFields {
  id: string;
  fullName: string;
  admissionDate: string;
  roleDescription: string;
  shift: 'DIA' | 'NOITE';
  currentColor: FeedbackColor | null;
  nextFeedbackDueDate: string | null;
  sector: (Lookup & { usesColorCycle?: boolean }) | null;
  unit: Lookup | null;
  evaluations?: { period: 'FIRST' | 'SECOND' | 'FEEDBACK' }[];
}

type ColorFilter = FeedbackColor | 'TODOS' | 'SEM_COR';

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const SHIFT_LABEL: Record<'DIA' | 'NOITE', string> = { DIA: 'Turno diurno', NOITE: 'Turno noturno' };

/**
 * Cor do ponto de status. Deixou de ser fundo pastel (`bg-amber-100`): numa
 * lista de trinta funcionários eram trinta retângulos coloridos, e quem
 * estava atrasado não se distinguia de quem estava em dia. As cores vieram
 * da escala do mapa de calor, para o sistema falar uma cor só.
 */
const STATUS_PONTO: Record<Employee['status'], string> = {
  AWAITING_PERIOD_1: '#E8B400',
  AWAITING_PERIOD_2: '#E8B400',
  HIRED: '#0F7A3D',
  TERMINATED: '#9C9C95',
};

type Aba = 'acompanhamento' | 'consulta';
const CHAVES_DA_CONSULTA = new Set(['aba', 'ordem', 'sentido', ...CONSULTA_PARAM_KEYS]);

/** useSearchParams exige um Suspense acima dele no App Router. */
export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={<SkeletonCardList rows={5} />}>
      <AdminEmployees />
    </Suspense>
  );
}

function AdminEmployees() {
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const aba: Aba = params.get('aba') === 'consulta' ? 'consulta' : 'acompanhamento';
  // Trocar de aba limpa os filtros da consulta: são daquela aba.
  const irPara = (a: Aba) => {
    // Mantém parâmetros que não são da consulta (a bancada de auditoria usa ?tela=).
    const p = new URLSearchParams(params.toString());
    for (const k of [...p.keys()]) if (CHAVES_DA_CONSULTA.has(k)) p.delete(k);
    if (a === 'consulta') p.set('aba', 'consulta');
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  const [colorFilter, setColorFilter] = useState<ColorFilter>('TODOS');
  const [arquivoAberto, setArquivoAberto] = useState(false);
  const { mostrar } = useToast();

  /**
   * As três listas numa carga só.
   *
   * O `Promise.all` antigo não tinha `.catch`: com a API fora do ar a promessa
   * rejeitava no console, `loading` virava false e a tela caía no estado vazio
   * — o RH lia "Nenhum funcionário em experiência cadastrado ainda" numa base
   * cheia de gente. Agora a falha é um estado próprio, com "Tentar de novo".
   */
  const { data, loading, reloading, error, forbidden, reload } = useAsyncData(
    async (signal) => {
      const [emp, sec, uni] = await Promise.all([
        apiFetch<{ employees: Employee[] }>('/api/admin/employees', { signal }),
        apiFetch<{ sectors: SectorLookup[] }>('/api/admin/sectors', { signal }),
        apiFetch<{ units: Lookup[] }>('/api/admin/units', { signal }),
      ]);
      // Só os setores de avaliação: "Administração" é da pesquisa, e quem
      // trabalha lá é cadastrado na área do gestor (ver sectors.inEvaluation).
      return { employees: emp.employees, sectors: sec.sectors.filter((s) => s.inEvaluation), units: uni.units };
    },
    [],
    { mensagemPadrao: 'Erro ao carregar os funcionários.' },
  );
  const employees = data?.employees ?? [];
  const sectors = data?.sectors ?? [];
  const units = data?.units ?? [];

  const visible = employees.filter((e) => {
    if (colorFilter === 'TODOS') return true;
    if (colorFilter === 'SEM_COR') return !e.currentColor;
    return e.currentColor === colorFilter;
  });
  const acompanhamento = separarAcompanhamento(visible, units);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Avaliação de Experiência</h1>
          <p className="text-spot-gray-500 text-sm">Funcionários em período de 90 dias, divididos em 2 ciclos de 45.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LembrarGestores />
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Cadastrar funcionário</button>
        </div>
      </div>

      {/* Duas partes da mesma seção: o acompanhamento do dia a dia e a
          consulta que substitui o quadro de admissões do DP. */}
      <div role="tablist" aria-label="Partes da avaliação de experiência" className="flex gap-6 border-b border-spot-gray-200 -mt-2">
        {([
          ['acompanhamento', 'Acompanhamento'],
          ['consulta', 'Consulta avançada'],
        ] as const).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            id={`aba-${valor}`}
            aria-selected={aba === valor}
            aria-controls={`painel-${valor}`}
            onClick={() => irPara(valor)}
            className={`pb-2.5 -mb-px border-b-2 text-sm font-semibold transition ${aba === valor ? 'border-spot-yellow text-spot-gray-900' : 'border-transparent text-spot-gray-500 hover:text-spot-gray-900'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <RefreshingBar visible={reloading} texto="Atualizando a lista..." />

      {aba === 'consulta' ? (
        <div role="tabpanel" id="painel-consulta" aria-labelledby="aba-consulta">
          <AsyncSection
            loading={loading}
            error={error}
            forbidden={forbidden}
            onRetry={reload}
            retrying={reloading}
            rotulo="os funcionários"
            skeleton={<SkeletonCardList rows={6} />}
            empty={employees.length === 0}
            emptyState={<EmptyState>Nenhum funcionário em experiência cadastrado ainda.</EmptyState>}
          >
            <ConsultaAvancada
              employees={employees as unknown as ReportEmployeeInput[]}
              units={units}
              sectors={sectors}
            />
          </AsyncSection>
        </div>
      ) : (
      <div role="tabpanel" id="painel-acompanhamento" aria-labelledby="aba-acompanhamento" className="flex flex-col gap-6">

      {/* Filtro por classificação — a pergunta prática é "quem está vermelho?".
          Escondido durante a carga e no erro: contadores zerados ("Vermelho (0)")
          afirmam algo que ainda não se sabe. */}
      {!loading && !error && (
        <div className="flex flex-wrap gap-2">
          {([
          { value: 'TODOS' as const, label: `Todos (${employees.length})`, dot: null },
          ...COLOR_OPTIONS.map((c) => ({
            value: c.value,
            label: `${COLOR_LABELS[c.value]} (${employees.filter((e) => e.currentColor === c.value).length})`,
            dot: c.dotClassName,
          })),
          { value: 'SEM_COR' as const, label: `Sem classificação (${employees.filter((e) => !e.currentColor).length})`, dot: null },
        ]).map((opt) => (
          <button
              key={opt.value}
              type="button"
              /* aria-pressed: o filtro ativo so se distinguia pelo fundo preto.
                 Sem isto, nem leitor de tela nem quem nao separa bem as cores
                 sabe qual recorte esta valendo — e a lista abaixo muda por
                 causa dele. */
              aria-pressed={colorFilter === opt.value}
              onClick={() => setColorFilter(opt.value)}
              className={`badge flex items-center gap-1.5 min-h-11 transition ${colorFilter === opt.value ? 'bg-spot-black text-spot-onBlack' : 'bg-spot-gray-100 text-spot-gray-600 hover:bg-spot-gray-200'}`}
            >
              {/* A bolinha e so cor: sem rotulo, "Vermelho (3)" ja diz tudo. */}
              {opt.dot && <span aria-hidden className={`h-2 w-2 rounded-full ${opt.dot}`} />}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="os funcionários"
        skeleton={<SkeletonCardList rows={5} />}
        empty={employees.length === 0 || visible.length === 0}
        emptyState={
          <EmptyState>
            {employees.length === 0
              ? 'Nenhum funcionário em experiência cadastrado ainda.'
              : 'Ninguém nesta classificação.'}
          </EmptyState>
        }
      >
        {/* Pendentes por loja (1ª e 2ª avaliação), depois o arquivo — quem já
            passou pela experiência e os aprendizes (employeeGroups.ts). */}
        <div className="flex flex-col gap-10">
          {acompanhamento.pendentes.length === 0 && (
            <p className="text-spot-gray-500">Nenhuma avaliação pendente{colorFilter === 'TODOS' ? '' : ' nesta classificação'}.</p>
          )}
          {acompanhamento.pendentes.map((loja) => (
            <section key={loja.chave} aria-labelledby={`loja-${loja.chave}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-spot-gray-900 pb-2">
                <h2 id={`loja-${loja.chave}`} className="font-display text-2xl font-semibold leading-tight">
                  {loja.unidade?.name ?? 'Sem loja'}
                </h2>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-spot-gray-500">
                  {plural(loja.primeira.length + loja.segunda.length, 'avaliação pendente', 'avaliações pendentes')}
                </p>
              </div>
              {([['1ª avaliação', loja.primeira], ['2ª avaliação', loja.segunda]] as const).map(([titulo, lista]) => lista.length > 0 && (
                <div key={titulo} className="mt-5">
                  <h3 className="flex items-baseline justify-between gap-x-4 border-b border-spot-gray-300 pb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-spot-gray-800">
                    <span>{titulo}</span>
                    <span className="text-spot-gray-500">{lista.length}</span>
                  </h3>
                  <div className="[&>*:last-child]:border-b-0">
                    {lista.map((e) => <LinhaFuncionario key={e.id} e={e} />)}
                  </div>
                </div>
              ))}
            </section>
          ))}

          {acompanhamento.totalArquivados > 0 && (
            <section aria-labelledby="arquivo" className="border-t-2 border-spot-gray-300 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="arquivo" className="font-display text-xl font-semibold leading-tight text-spot-gray-800">
                    Arquivo <span className="text-spot-gray-500 font-normal">({acompanhamento.totalArquivados})</span>
                  </h2>
                  <p className="text-sm text-spot-gray-500">Avaliações concluídas: efetivados, desligados e aprendizes.</p>
                </div>
                {colorFilter === 'TODOS' && (
                  <button
                    type="button"
                    className="btn-ghost py-2 px-4"
                    aria-expanded={arquivoAberto}
                    aria-controls="lista-arquivo"
                    onClick={() => setArquivoAberto((v) => !v)}
                  >
                    {arquivoAberto ? 'Recolher' : 'Mostrar arquivo'}
                  </button>
                )}
              </div>
              {/* Com um filtro de cor ligado o arquivo abre: é lá que ficam os efetivados em ciclo de feedback. */}
              {(arquivoAberto || colorFilter !== 'TODOS') && (
                <div id="lista-arquivo" className="flex flex-col gap-6 mt-4">
                  {acompanhamento.arquivados.map((loja) => (
                    <div key={loja.chave}>
                      <h3 className="flex items-baseline justify-between gap-x-4 border-b border-spot-gray-300 pb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-spot-gray-800">
                        <span>{loja.unidade?.name ?? 'Sem loja'}</span>
                        <span className="text-spot-gray-500">{loja.itens.length}</span>
                      </h3>
                      <div className="[&>*:last-child]:border-b-0">
                        {loja.itens.map((e) => <LinhaFuncionario key={e.id} e={e} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </AsyncSection>
      </div>
      )}

      {showCreate && (
        <CreateEmployeeModal
          sectors={sectors}
          units={units}
          onClose={() => setShowCreate(false)}
          onCreated={async (nome) => {
            setShowCreate(false);
            mostrar(`${nome} cadastrado.`);
            await reload();
          }}
        />
      )}
    </div>
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A loja está no cabeçalho; a linha traz cargo, setor e turno. */
function LinhaFuncionario({ e }: { e: Employee }) {
  // Efetivado no 1º período que ainda deve a 2ª avaliação: o prazo em aberto é o de 90 dias.
  const deveSegunda = faseDo(e) === 'PENDENTE_2' && e.status === 'HIRED';
  const badge = dueBadge(deveSegunda ? new Date(e.period2DueDate) : pendingDueDate(e));
  const colorOption = e.currentColor ? COLOR_OPTIONS.find((c) => c.value === e.currentColor) : null;
  const cycleBadge = e.currentColor
    ? feedbackStatusBadge({
      nextDueDate: e.nextFeedbackDueDate ? new Date(e.nextFeedbackDueDate) : null,
      completed: e.status === 'TERMINATED',
    })
    : null;
  return (
    <Link
      href={`/admin/employees/${e.id}`}
      className="group flex items-center justify-between gap-4 flex-wrap py-4 border-b border-spot-gray-200 transition-colors hover:bg-spot-white"
    >
      <div className="min-w-0">
        <p className="font-semibold truncate group-hover:underline underline-offset-4 decoration-spot-yellow decoration-2">
          {e.fullName}
        </p>
        <p className="text-sm text-spot-gray-500">{e.roleDescription} · {e.sector?.name ?? 'Sem setor'} · {SHIFT_LABEL[e.shift]}</p>
        <p className="text-xs text-spot-gray-500 mt-0.5">
          Admissão {formatDate(e.admissionDate)}
          {colorOption && e.nextFeedbackDueDate && e.status !== 'TERMINATED' && (
            <> · próximo feedback {formatDate(e.nextFeedbackDueDate)} (a cada {COLOR_INTERVAL_DAYS[colorOption.value]} dias)</>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0 font-mono text-[11px] uppercase tracking-[0.1em]">
        {colorOption ? (
          <span className="flex items-center gap-2 text-spot-gray-800">
            <span aria-hidden className={`h-2 w-2 rounded-full ${colorOption.dotClassName}`} />
            {COLOR_LABELS[colorOption.value]}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-spot-gray-800">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_PONTO[e.status] }} />
            {statusLabel(e)}
          </span>
        )}
        {badge && <span className={badge.className}>{badge.label}</span>}
        {cycleBadge && <span className={cycleBadge.className}>{cycleBadge.label}</span>}
      </div>
    </Link>
  );
}

function CreateEmployeeModal({
  sectors, units, onClose, onCreated,
}: { sectors: Lookup[]; units: Lookup[]; onClose: () => void; onCreated: (nome: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [shift, setShift] = useState<'DIA' | 'NOITE'>('DIA');
  const [isApprentice, setIsApprentice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guarda contra duplo envio: no celular o toque duplo é comum, e o botão
    // fica visível durante a requisição inteira.
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/admin/employees', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          // T12:00 evita que o fuso jogue a data para o dia anterior ao virar UTC.
          admissionDate: new Date(`${admissionDate}T12:00:00`).toISOString(),
          roleDescription,
          sectorId,
          unitId,
          shift,
          isApprentice,
        }),
      });
      onCreated(fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar funcionário.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab continuava passeando pelo conteudo
          coberto atras dele, incluindo botoes destrutivos. */}
      <form
        ref={painelRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Cadastrar funcionário em experiência"
        className="bg-spot-white rounded-xl2 max-w-md w-full p-6 flex flex-col gap-4 modal-panel"
      >
        <h2 className="font-display text-xl font-semibold">Cadastrar funcionário em experiência</h2>
        <div>
          <label className="block">
            <span className="label">Nome completo</span>
            <input required className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Data de admissão</span>
            <input required type="date" className="input" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Cargo / função</span>
            <input required className="input" value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Setor</span>
            <select required className="input" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">Selecione</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Unidade</span>
            <select required className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Selecione</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>
        <div>
          <label className="block">
            <span className="label">Turno</span>
            <select required className="input" value={shift} onChange={(e) => setShift(e.target.value as 'DIA' | 'NOITE')}>
              <option value="DIA">Diurno</option>
              <option value="NOITE">Noturno</option>
            </select>
          </label>
          <p className="text-xs text-spot-gray-500 mt-1">Junto com o setor e a unidade, define quais gestores ficam responsáveis por avaliar este funcionário.</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={isApprentice} onChange={(e) => setIsApprentice(e.target.checked)} />
          <span>
            Jovem aprendiz
            <span className="block text-xs text-spot-gray-500">Contrato de aprendizagem: sem prazo de 45/90 dias e sem avaliação de experiência.</span>
          </span>
        </label>
        {error && <p role="alert" className="text-sm text-spot-danger">{error}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
          <ActionButton type="submit" className="btn-primary flex-1" pending={saving} pendingLabel="Salvando...">
            Cadastrar
          </ActionButton>
        </div>
      </form>
    </div>
  );
}
