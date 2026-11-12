'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiClientError } from '@/lib/apiClient';
import { ActionButton, useToast } from '@/components/async';
import { scrollToFirstError } from '@/lib/scrollToError';
import { TRACK_HINTS, TRACK_LABELS, type EmployeeTrack } from '@/lib/employeeCreate';

interface Lookup { id: string; name: string }
type Portal = 'admin' | 'gestor';

/** Hoje no formato AAAA-MM-DD, no fuso local (o `input[type=date]` trabalha assim). */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Cadastro único de colaborador, usado pelo painel administrativo e pelo
 * portal da operação. As listas (unidade, setor, turno) vêm do servidor já
 * recortadas pelo escopo de quem cadastra — a tela não oferece o que a rota
 * recusaria. A trilha define para onde o colaborador vai:
 *  - Novo: treinamento (quando o setor tem), experiência e feedback;
 *  - Ativo: já na operação — só o feedback.
 *
 * `soAntigo` é o cadastro feito dentro da aba Feedback: a trilha fica fixa em
 * Ativo (sem escolha) e os setores são os que fazem feedback; depois de salvar,
 * a volta é para a lista de feedbacks.
 */
export function CadastroFuncionario({ portal, soAntigo = false }: { portal: Portal; soAntigo?: boolean }) {
  const { mostrar } = useToast();
  const [sectors, setSectors] = useState<Lookup[]>([]);
  const [units, setUnits] = useState<Lookup[]>([]);
  const [shifts, setShifts] = useState<string[]>(['DIA', 'NOITE']);
  const [canChooseTrack, setCanChooseTrack] = useState(true);
  const [carregando, setCarregando] = useState(true);

  const [track, setTrack] = useState<EmployeeTrack>(soAntigo ? 'ATIVO' : 'NOVO');
  const [fullName, setFullName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [admissionDate, setAdmissionDate] = useState(soAntigo ? '' : hojeISO());
  const [sectorId, setSectorId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [shift, setShift] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (portal === 'gestor') {
          const d = await apiFetch<{ sectors: Lookup[]; units: Lookup[]; shifts: string[]; canChooseTrack: boolean }>(
            soAntigo ? '/api/gestor/lookups?para=feedback' : '/api/gestor/lookups',
          );
          if (!vivo) return;
          setSectors(d.sectors); setUnits(d.units); setShifts(d.shifts); setCanChooseTrack(d.canChooseTrack && !soAntigo);
          if (d.sectors.length === 1) setSectorId(d.sectors[0].id);
          if (d.units.length === 1) setUnitId(d.units[0].id);
          if (d.shifts.length === 1) setShift(d.shifts[0]);
        } else {
          const [s, u] = await Promise.all([
            apiFetch<{ sectors: (Lookup & { active: boolean; inEvaluation: boolean })[] }>('/api/admin/sectors'),
            apiFetch<{ units: (Lookup & { active: boolean })[] }>('/api/admin/units'),
          ]);
          if (!vivo) return;
          setSectors(s.sectors.filter((x) => x.active && x.inEvaluation));
          setUnits(u.units.filter((x) => x.active));
        }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'Erro ao carregar as listas.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [portal, soAntigo]);

  const errors = {
    fullName: fullName.trim().length < 2 ? 'Informe o nome completo.' : undefined,
    roleDescription: roleDescription.trim().length < 2 ? 'Informe o cargo/função.' : undefined,
    admissionDate: !admissionDate ? 'Informe a data de admissão.' : undefined,
    sectorId: !sectorId ? 'Selecione o setor.' : undefined,
    unitId: !unitId ? 'Selecione a unidade.' : undefined,
    shift: !shift ? 'Selecione o turno.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (attempted ? errors[k] : undefined);

  const enviar = async (allowDuplicate: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setDuplicado(false);
    try {
      await apiFetch(portal === 'admin' ? '/api/admin/employees' : '/api/gestor/employees', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          roleDescription: roleDescription.trim(),
          // T12:00 evita que o fuso jogue a data para o dia anterior ao virar UTC.
          admissionDate: new Date(`${admissionDate}T12:00:00`).toISOString(),
          sectorId, unitId, shift,
          track,
          ...(allowDuplicate ? { allowDuplicate: true } : {}),
        }),
      });
      mostrar(`${fullName.trim()} cadastrado.`);
      setUltimo(fullName.trim());
      // Mantém unidade/setor/turno: quem cadastra uma equipe inteira repete os mesmos.
      setFullName(''); setRoleDescription(''); setAttempted(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409 && portal === 'admin' && err.data.duplicate) setDuplicado(true);
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) { setAttempted(true); scrollToFirstError(); return; }
    void enviar(false);
  };

  const desabilitado = carregando || saving;

  return (
    <form onSubmit={submit} className="bg-spot-white rounded-xl2 border border-spot-gray-200 p-5 sm:p-6 flex flex-col gap-4 max-w-2xl">
      {canChooseTrack && (
        <fieldset className="flex flex-col gap-2">
          <legend className="label">Tipo de colaborador</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(['NOVO', 'ATIVO'] as const).map((t) => (
              <label
                key={t}
                className={`flex items-start gap-2.5 rounded-btn border px-3 py-2.5 cursor-pointer min-h-11 ${track === t ? 'border-spot-gray-900 bg-spot-cream' : 'border-spot-gray-300'}`}
              >
                <input type="radio" name="trilha" className="mt-1" checked={track === t} onChange={() => setTrack(t)} disabled={saving} />
                <span>
                  <span className="block text-sm font-semibold">{TRACK_LABELS[t]}</span>
                  <span className="block text-xs text-spot-gray-600">{TRACK_HINTS[t]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div data-erro={show('fullName') ? 'true' : undefined}>
        <label className="block">
          <span className="label">Nome completo</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={saving} autoComplete="off" />
        </label>
        {show('fullName') && <p className="text-xs text-spot-danger mt-1">{errors.fullName}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div data-erro={show('roleDescription') ? 'true' : undefined}>
          <label className="block">
            <span className="label">Cargo / função</span>
            <input className="input" value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} disabled={saving} />
          </label>
          {show('roleDescription') && <p className="text-xs text-spot-danger mt-1">{errors.roleDescription}</p>}
        </div>
        <div data-erro={show('admissionDate') ? 'true' : undefined}>
          <label className="block">
            <span className="label">{soAntigo ? 'Data de admissão (aproximada)' : 'Data de admissão'}</span>
            <input type="date" className="input" value={admissionDate} max={hojeISO()} onChange={(e) => setAdmissionDate(e.target.value)} disabled={saving} />
          </label>
          {show('admissionDate') && <p className="text-xs text-spot-danger mt-1">{errors.admissionDate}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div data-erro={show('unitId') ? 'true' : undefined}>
          <label className="block">
            <span className="label">Unidade</span>
            <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={desabilitado}>
              <option value="">{carregando ? 'Carregando...' : 'Selecione'}</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          {show('unitId') && <p className="text-xs text-spot-danger mt-1">{errors.unitId}</p>}
        </div>
        <div data-erro={show('sectorId') ? 'true' : undefined}>
          <label className="block">
            <span className="label">Setor</span>
            <select className="input" value={sectorId} onChange={(e) => setSectorId(e.target.value)} disabled={desabilitado}>
              <option value="">{carregando ? 'Carregando...' : 'Selecione'}</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {show('sectorId') && <p className="text-xs text-spot-danger mt-1">{errors.sectorId}</p>}
        </div>
        <div data-erro={show('shift') ? 'true' : undefined}>
          <label className="block">
            <span className="label">Turno</span>
            <select className="input" value={shift} onChange={(e) => setShift(e.target.value)} disabled={desabilitado}>
              <option value="">{carregando ? 'Carregando...' : 'Selecione'}</option>
              {shifts.map((s) => <option key={s} value={s}>{s === 'DIA' ? 'Diurno' : 'Noturno'}</option>)}
            </select>
          </label>
          {show('shift') && <p className="text-xs text-spot-danger mt-1">{errors.shift}</p>}
        </div>
      </div>
      <p className="text-xs text-spot-gray-500 -mt-2">
        Unidade, setor e turno definem quais gestores acompanham este colaborador.
      </p>

      {soAntigo && !carregando && sectors.length === 0 && (
        <p className="text-sm text-spot-gray-700">
          Nenhum setor seu faz feedback. O RH escolhe os setores em Setores.
        </p>
      )}

      {error && <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
      {ultimo && !error && (
        <p role="status" className="text-sm text-spot-gray-700">
          {ultimo} foi cadastrado. Você pode cadastrar o próximo ou{' '}
          <Link className="underline" href={soAntigo ? '/gestor/feedback' : portal === 'admin' ? '/admin/employees' : '/gestor'}>
            {soAntigo ? 'voltar para o Feedback' : 'ver a lista'}
          </Link>.
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        {duplicado && (
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => void enviar(true)}>
            É outra pessoa — cadastrar mesmo assim
          </button>
        )}
        <ActionButton type="submit" className="btn-primary" pending={saving} pendingLabel="Salvando...">
          Cadastrar colaborador
        </ActionButton>
      </div>
    </form>
  );
}
