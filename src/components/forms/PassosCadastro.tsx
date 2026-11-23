'use client';

import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Ic } from '@/components/sp/Ic';
import { TRACK_HINTS, TRACK_LABELS, type EmployeeTrack } from '@/lib/employeeCreate';

/*
 * Cadastro de colaborador, UMA PERGUNTA POR VEZ (portal dos gestores, padrão
 * Spot Integra). Só apresentação: os campos, as regras de validação e a
 * chamada de envio continuam em CadastroFuncionario, que passa tudo por props.
 */

export interface Lookup { id: string; name: string }
export type Erros = Record<'fullName' | 'roleDescription' | 'admissionDate' | 'sectorId' | 'unitId' | 'shift', string | undefined>;

export interface PassosProps {
  soAntigo: boolean; carregando: boolean; saving: boolean; error: string | null; duplicado: boolean; ultimo: string | null; fim: boolean;
  canChooseTrack: boolean; track: EmployeeTrack; setTrack: (t: EmployeeTrack) => void;
  fullName: string; setFullName: (v: string) => void;
  roleDescription: string; setRoleDescription: (v: string) => void;
  admissionDate: string; setAdmissionDate: (v: string) => void;
  units: Lookup[]; unitId: string; setUnitId: (v: string) => void;
  sectors: Lookup[]; sectorId: string; setSectorId: (v: string) => void;
  shifts: string[]; shift: string; setShift: (v: string) => void;
  errors: Erros;
  hoje: string;
  enviar: (allowDuplicate: boolean) => Promise<void>;
  proximo: () => void;
}

type IdPasso = 'track' | 'fullName' | 'roleDescription' | 'admissionDate' | 'unitId' | 'sectorId' | 'shift' | 'revisao';

const turnoDe = (s: string) => (s === 'DIA' ? 'Diurno' : s === 'NOITE' ? 'Noturno' : s);

export function PassosCadastro(p: PassosProps) {
  const [i, setI] = useState(0);
  const [tentou, setTentou] = useState(false);

  // Unidade, setor e turno com uma única opção já vêm preenchidos: não viram pergunta.
  const passos = useMemo<IdPasso[]>(() => {
    const l: IdPasso[] = [];
    if (p.canChooseTrack) l.push('track');
    l.push('fullName', 'roleDescription', 'admissionDate');
    if (p.carregando || p.units.length !== 1) l.push('unitId');
    if (p.carregando || p.sectors.length !== 1) l.push('sectorId');
    if (p.carregando || p.shifts.length !== 1) l.push('shift');
    l.push('revisao');
    return l;
  }, [p.canChooseTrack, p.carregando, p.units.length, p.sectors.length, p.shifts.length]);

  const atual = passos[Math.min(i, passos.length - 1)];
  const erroDe = atual === 'track' || atual === 'revisao' ? undefined : p.errors[atual];
  const nomeDe = (lista: Lookup[], id: string) => lista.find((x) => x.id === id)?.name ?? '';

  const ir = (n: number) => { setTentou(false); setI(Math.max(0, Math.min(n, passos.length - 1))); };
  const continuar = () => {
    if (erroDe) { setTentou(true); return; }
    ir(i + 1);
  };
  // Escolha em opções grandes: marca e avança sozinho depois de 380 ms.
  const escolher = (marcar: () => void) => { marcar(); setTimeout(() => ir(i + 1), 380); };
  const tecla = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); continuar(); } };

  const primeiroErro = (['fullName', 'roleDescription', 'admissionDate', 'unitId', 'sectorId', 'shift'] as const).find((k) => p.errors[k]);

  if (p.fim && p.ultimo) {
    return (
      <div className="cad cad-fim" role="status">
        <span className="seal-s mk-stamp"><Ic n="check" s={40} w={3} /></span>
        <h2 className="H">{p.ultimo} foi cadastrado.</h2>
        <p className="mut">Unidade, setor e turno ficam guardados para quem cadastra uma equipe inteira.</p>
        <div className="cad-acoes">
          <button type="button" className="btn btn-gold btn-block press" onClick={() => { p.proximo(); setI(passos.indexOf('fullName')); }}>
            Cadastrar o próximo
          </button>
          <Link className="btn btn-ghost btn-block" href={p.soAntigo ? '/gestor/feedback' : '/gestor'}>
            {p.soAntigo ? 'Voltar para o Feedback' : 'Ver a lista'}
          </Link>
        </div>
      </div>
    );
  }

  const campo = (rotulo: string, node: ReactNode) => (
    <>
      <h2 className="H cad-q">{rotulo}</h2>
      {node}
    </>
  );
  const opcoes = (lista: { v: string; t: string; d?: string }[], valor: string, set: (v: string) => void) => lista.length === 0 && !p.carregando ? (
    <p className="miss" role="alert"><Ic n="info" s={16} /> Nenhuma opção liberada para o seu acesso. Peça ao RH para incluir no seu cadastro.</p>
  ) : (
    <div className="pass-opts" role="radiogroup">
      {lista.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} className="opt" onClick={() => escolher(() => set(o.v))}>
          <span className="d"><Ic n="check" s={14} w={3.2} /></span>
          <span className="opt-corpo"><b>{o.t}</b>{o.d && <span className="mut opt-desc">{o.d}</span>}</span>
        </button>
      ))}
    </div>
  );

  let corpo: ReactNode;
  if (atual === 'track') {
    corpo = campo('Que tipo de colaborador é?', opcoes(
      (['NOVO', 'ATIVO'] as const).map((t) => ({ v: t, t: TRACK_LABELS[t], d: TRACK_HINTS[t] })),
      p.track,
      (v) => p.setTrack(v as EmployeeTrack),
    ));
  } else if (atual === 'fullName') {
    corpo = campo('Qual é o nome completo?', (
      <div className="field"><input aria-label="Nome completo" value={p.fullName} onChange={(e) => p.setFullName(e.target.value)} onKeyDown={tecla} autoComplete="off" /></div>
    ));
  } else if (atual === 'roleDescription') {
    corpo = campo('Qual é o cargo ou a função?', (
      <div className="field"><input aria-label="Cargo ou função" value={p.roleDescription} onChange={(e) => p.setRoleDescription(e.target.value)} onKeyDown={tecla} /></div>
    ));
  } else if (atual === 'admissionDate') {
    corpo = campo(p.soAntigo ? 'Qual é a data de admissão (aproximada)?' : 'Qual é a data de admissão?', (
      <div className="field"><input type="date" aria-label="Data de admissão" value={p.admissionDate} max={p.hoje} onChange={(e) => p.setAdmissionDate(e.target.value)} onKeyDown={tecla} /></div>
    ));
  } else if (atual === 'unitId') {
    corpo = campo('Em qual unidade?', opcoes(p.units.map((u) => ({ v: u.id, t: u.name })), p.unitId, p.setUnitId));
  } else if (atual === 'sectorId') {
    corpo = campo('Em qual setor?', p.sectors.length <= 6
      ? opcoes(p.sectors.map((u) => ({ v: u.id, t: u.name })), p.sectorId, p.setSectorId)
      : (
        <div className="field">
          <select aria-label="Setor" value={p.sectorId} onChange={(e) => p.setSectorId(e.target.value)}>
            <option value="">Selecione</option>
            {p.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      ));
  } else if (atual === 'shift') {
    corpo = campo('Em qual turno?', opcoes(p.shifts.map((s) => ({ v: s, t: turnoDe(s) })), p.shift, p.setShift));
  } else {
    const linhas: [string, string, number][] = [
      ...(p.canChooseTrack ? [['Tipo', TRACK_LABELS[p.track], passos.indexOf('track')] as [string, string, number]] : []),
      ['Nome', p.fullName.trim(), passos.indexOf('fullName')],
      ['Cargo', p.roleDescription.trim(), passos.indexOf('roleDescription')],
      ['Admissão', p.admissionDate ? new Date(p.admissionDate + 'T12:00:00').toLocaleDateString('pt-BR') : '', passos.indexOf('admissionDate')],
      ['Unidade', nomeDe(p.units, p.unitId), passos.indexOf('unitId')],
      ['Setor', nomeDe(p.sectors, p.sectorId), passos.indexOf('sectorId')],
      ['Turno', p.shift ? turnoDe(p.shift) : '', passos.indexOf('shift')],
    ];
    corpo = campo('Confira e cadastre', (
      <>
        <div className="rvlist">
          {linhas.map(([k, v, n]) => (
            <div key={k} className="rv-linha">
              <span className="mut">{k}</span>
              <b>{v || '—'}</b>
              {n >= 0 ? <button type="button" className="link" onClick={() => ir(n)}>Corrigir</button> : <span />}
            </div>
          ))}
        </div>
        <p className="mut cad-nota">Unidade, setor e turno definem quais gestores acompanham este colaborador.</p>
        {p.soAntigo && !p.carregando && p.sectors.length === 0 && <p className="mut">Nenhum setor seu faz feedback. O RH escolhe os setores em Setores.</p>}
      </>
    ));
  }

  // Opções grandes avançam sozinhas ao toque; se já há uma marcada (voltou ou veio preenchida), aparece "Continuar".
  const jaMarcada = (atual === 'track' && Boolean(p.track)) || (atual === 'unitId' && Boolean(p.unitId)) || (atual === 'shift' && Boolean(p.shift)) || (atual === 'sectorId' && Boolean(p.sectorId));
  const semBotao = !jaMarcada && (atual === 'track' || atual === 'unitId' || atual === 'shift' || (atual === 'sectorId' && p.sectors.length <= 6));

  return (
    <div className="cad">
      <div className="cad-topo">
        {i > 0 ? (
          <button type="button" className="ibtn" onClick={() => ir(i - 1)} aria-label="Voltar para a pergunta anterior"><Ic n="left" s={20} /></button>
        ) : <span style={{ width: 44 }} />}
        <div
          className="segs segs-n"
          style={{ ['--n' as string]: passos.length }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={passos.length}
          aria-valuenow={i + 1}
          aria-valuetext={`Passo ${i + 1} de ${passos.length}`}
        >
          {passos.map((id, k) => <span key={id} className={k < i ? 'is-done' : ''}><i style={{ width: k < i ? '100%' : k === i ? '45%' : '0%' }} /></span>)}
        </div>
        <span className="kick">{i + 1} / {passos.length}</span>
      </div>
      <div className="cad-corpo swap-in" key={atual}>
        {corpo}
        {tentou && erroDe && <p className="miss" role="alert"><Ic n="info" s={16} /> {erroDe}</p>}
        {p.error && atual === 'revisao' && <p className="miss" role="alert"><Ic n="info" s={16} /> {p.error}</p>}
      </div>
      <div className="cad-acoes">
        {atual === 'revisao' ? (
          <>
            {p.duplicado && (
              <button type="button" className="btn btn-ghost btn-block" disabled={p.saving} onClick={() => void p.enviar(true)}>
                É outra pessoa: cadastrar mesmo assim
              </button>
            )}
            <button
              type="button"
              className="btn btn-gold btn-block press"
              disabled={p.saving || p.carregando}
              onClick={() => {
                if (primeiroErro) { ir(passos.indexOf(primeiroErro)); setTimeout(() => setTentou(true), 50); return; }
                void p.enviar(false);
              }}
            >
              {p.saving ? 'Salvando…' : 'Cadastrar colaborador'}
            </button>
          </>
        ) : semBotao ? null : (
          <button type="button" className="btn btn-ink btn-block press" onClick={continuar}>
            Continuar <Ic n="arrow" s={20} w={2.2} className="arr" />
          </button>
        )}
      </div>
    </div>
  );
}
