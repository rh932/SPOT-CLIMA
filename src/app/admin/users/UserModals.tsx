'use client';

/**
 * Formulários de criar e editar usuário — vieram da tela de Configurações
 * quando os usuários ganharam uma aba própria (/admin/users).
 */

import { useId, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { usePainelModal } from '@/components/forms/usePainelModal';
import { LEADER_AREA_LABEL, SCOPED_ROLES, type AccessUser, type LeaderArea, type UserRole } from '@/lib/userAccess';

interface Lookup { id: string; name: string; inTraining?: boolean }

/**
 * O treinamento é só do Salão (sectors.inTraining): o Treinador só pode ser
 * responsável por esses setores. Setor de outra área marcado antes de trocar o
 * perfil para Treinador é descartado aqui, em vez de ficar escondido e marcado.
 * A rota de usuários valida o mesmo.
 */
function setoresDoPerfil(role: string, sectors: Lookup[], ids: string[]): string[] {
  if (role !== 'TREINADOR' && role !== 'GERENTE') return ids;
  return ids.filter((id) => sectors.find((s) => s.id === id)?.inTraining);
}

// Senhas ficam com hash (bcrypt) no banco — nem o SUPER_ADMIN consegue "ver" a
// senha atual de alguém. O que dá para oferecer é: gerar uma nova senha aqui
// (substituindo a antiga) e revelar em tela essa senha nova antes de salvar.
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

function ScopeCheckboxList({
  label, options, selected, onChange, emptyText, hint, todos = false,
}: {
  todos?: boolean; label: string; options: Lookup[]; selected: string[]; onChange: (ids: string[]) => void;
  emptyText: string; hint: string;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    /* fieldset/legend, nao <label>: label rotula UM controle e aqui sao varias
       caixas de selecao. Sem o grupo, o leitor de tela lia "Salao, caixa de
       selecao" sem nunca dizer que a pergunta era "Setores". */
    <fieldset className="min-w-0 border-0 p-0 m-0">
      <legend className="label">{label}</legend>
      {todos && options.length > 0 && (
        <button
          type="button"
          className="text-xs underline underline-offset-4 text-spot-gray-600 hover:text-spot-gray-900 mb-1.5 min-h-8"
          onClick={() => onChange(selected.length === options.length ? [] : options.map((o) => o.id))}
        >
          {selected.length === options.length ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      )}
      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto border border-spot-gray-200 rounded-btn p-2.5">
        {options.length === 0 && <p className="text-xs text-spot-gray-500">{emptyText}</p>}
        {options.map((o) => (
          /* min-h-11: a area clicavel era a altura do texto (~20px). */
          <label key={o.id} className="flex items-center gap-2 text-sm min-h-11">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.name}
          </label>
        ))}
      </div>
      <p className="text-xs text-spot-gray-500 mt-1">{hint}</p>
    </fieldset>
  );
}

const SHIFT_OPTIONS: Lookup[] = [{ id: 'DIA', name: 'Diurno' }, { id: 'NOITE', name: 'Noturno' }];

function ScopeFields({
  units, sectors, unitIds, sectorIds, shifts, role, onUnits, onSectors, onShifts,
}: {
  units: Lookup[]; sectors: Lookup[]; unitIds: string[]; sectorIds: string[]; shifts: string[]; role: string;
  onUnits: (ids: string[]) => void; onSectors: (ids: string[]) => void; onShifts: (s: string[]) => void;
}) {
  return (
    <>
      <ScopeCheckboxList
        label="Unidades (loja)"
        options={units}
        selected={unitIds}
        onChange={onUnits}
        todos={role === 'GESTOR_LIDER'}
        emptyText="Nenhuma unidade cadastrada."
        hint="Pode ser vinculado a mais de uma unidade."
      />
      <ScopeCheckboxList
        label={role === 'TREINADOR' ? 'Setor / grupo que ele treina' : 'Setores'}
        options={role === 'TREINADOR' || role === 'GERENTE' ? sectors.filter((s) => s.inTraining) : sectors}
        selected={sectorIds}
        onChange={onSectors}
        todos={role === 'GESTOR_LIDER'}
        emptyText="Nenhum setor cadastrado."
        hint={role === 'GERENTE'
          ? 'O Gerente é só do Salão: aparecem apenas os setores de Salão.'
          : role === 'TREINADOR'
          ? 'O treinamento é só do Salão. O treinador vê e treina apenas os colaboradores dos setores marcados aqui (ex.: Bar, Atendimento, Gerente).'
          : 'Vincule um ou mais setores. O gestor só enxerga funcionários que estejam em um destes setores.'}
      />
      <ScopeCheckboxList
        label="Turnos"
        options={SHIFT_OPTIONS}
        selected={shifts}
        onChange={onShifts}
        todos={role === 'GESTOR_LIDER'}
        emptyText=""
        hint={role === 'GESTOR_LIDER'
          ? 'O Líder costuma acompanhar os dois turnos.'
          : 'O gestor do diurno e o do noturno são contas separadas — marque só o turno dele.'}
      />
    </>
  );
}

function PasswordField({
  value, onChange, label, minLength = 8, required = false, placeholder,
}: { value: string; onChange: (v: string) => void; label: string; minLength?: number; required?: boolean; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  // O <label> era IRMAO do input, sem `htmlFor`: rotulo so associa ao campo
  // quando o envolve ou aponta por id. Na pratica o campo de senha nao tinha
  // nome acessivel nenhum — o leitor de tela anunciava "edicao de senha" e
  // pronto, sem dizer se era a senha nova, a de confirmacao ou a do admin.
  const idCampo = useId();
  return (
    <div>
      <label className="label" htmlFor={idCampo}>{label}</label>
      <div className="flex gap-2">
        <input
          id={idCampo}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          className="input flex-1"
          value={value}
          placeholder={placeholder}
          autoComplete="new-password"
          onChange={(e) => onChange(e.target.value)}
        />
        {/* "Ver"/"Ocultar" com tres letras, e o mesmo par aparece em cada
           campo de senha do formulario. A informacao de QUE e senha estava so
           no `title`, que nao existe no toque. Agora vai no aria-label, com
           aria-pressed para o estado atual. */}
        <button
          type="button"
          className="btn-ghost px-3 text-sm"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? `Ocultar a ${label.toLowerCase()}` : `Mostrar a ${label.toLowerCase()} em texto`}
          title={visible ? 'Ocultar senha' : 'Ver senha'}
        >
          {visible ? 'Ocultar' : 'Ver'}
        </button>
        <button
          type="button"
          className="btn-ghost px-3 text-sm"
          onClick={() => { onChange(generatePassword()); setVisible(true); }}
          aria-label={`Gerar uma ${label.toLowerCase()} aleatória e mostrá-la`}
        >
          Gerar
        </button>
      </div>
    </div>
  );
}

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: 'RH', label: 'RH', hint: 'Acesso administrativo completo.' },
  { value: 'SUPER_ADMIN', label: 'Super Admin', hint: 'Acesso completo, incluindo usuários e personalização.' },
  { value: 'GESTOR', label: 'Gestor', hint: 'Avalia a equipe do próprio setor/turno e conclui o treinamento dela.' },
  { value: 'GERENTE', label: 'Gerente', hint: 'Mesma função do Gestor (avalia e treina a equipe), mas só no Salão.' },
  { value: 'GESTOR_LIDER', label: 'Líder', hint: 'Enxerga todas as lojas, setores e turnos, sem avaliar; conclui treinamentos.' },
];

/**
 * Formulário longo dentro de modal: cabeçalho e rodapé fixos, corpo rolável.
 * Sem isso o botão de salvar fugia da tela e obrigava a diminuir o zoom.
 */
function ModalShell({
  title, subtitle, onClose, onSubmit, saving, submitLabel, children,
}: {
  title: string; subtitle?: string; onClose: () => void;
  onSubmit: (e: React.FormEvent) => void; saving: boolean; submitLabel: string;
  children: React.ReactNode;
}) {
  const painelRef = usePainelModal<HTMLFormElement>({ aberto: true, aoFechar: onClose, podeFechar: !saving });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-fadeIn">
      {/* role/aria-modal + foco preso (usePainelModal): antes nada anunciava
          que o painel abriu e o Tab seguia pelo conteudo coberto atras. */}
      <form
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={onSubmit}
        className="bg-spot-white w-full sm:max-w-2xl rounded-t-xl2 sm:rounded-xl2 flex flex-col max-h-[92vh] sm:max-h-[88vh] modal-panel"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-spot-gray-200 shrink-0">
          <h2 className="font-sans text-xl font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-spot-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 flex flex-col gap-6">
          {children}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-spot-gray-200 shrink-0 flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'Salvando...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">{title}</p>
      {children}
    </section>
  );
}

function Field({
  label, error, children, htmlFor,
}: { label: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <p className="text-xs text-spot-danger mt-1">{error}</p>}
    </div>
  );
}

function RoleField({ value, onChange }: { value: UserRole; onChange: (r: UserRole) => void }) {
  const hint = ROLE_OPTIONS.find((o) => o.value === value)?.hint;
  return (
    <Field label="Perfil de acesso" htmlFor="admin-role">
      <select id="admin-role" className="input" value={value} onChange={(e) => onChange(e.target.value as UserRole)}>
        {ROLE_OPTIONS.filter((o) => o.value !== 'RH' || value === 'RH').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="text-xs text-spot-gray-500 mt-1">{hint}</p>}
    </Field>
  );
}

function AreaField({ value, onChange }: { value: LeaderArea | ''; onChange: (a: LeaderArea | '') => void }) {
  return (
    <Field label="Área do Líder" htmlFor="admin-area">
      <select id="admin-area" className="input" value={value} onChange={(e) => onChange(e.target.value as LeaderArea | '')}>
        <option value="">Sem área definida</option>
        {(Object.keys(LEADER_AREA_LABEL) as LeaderArea[]).map((a) => <option key={a} value={a}>{LEADER_AREA_LABEL[a]}</option>)}
      </select>
      <p className="text-xs text-spot-gray-500 mt-1">Só organiza e filtra a lista de líderes.</p>
    </Field>
  );
}

export function CreateAdminModal({
  sectors, units, onClose, onCreated,
}: { sectors: Lookup[]; units: Lookup[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [role, setRole] = useState<UserRole>('GESTOR');
  const [leaderArea, setLeaderArea] = useState<LeaderArea | ''>('');
  const [scopedUnitIds, setScopedUnitIds] = useState<string[]>([]);
  const [scopedSectorIds, setScopedSectorIds] = useState<string[]>([]);
  const [scopedShifts, setScopedShifts] = useState<string[]>(['DIA']);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGestor = SCOPED_ROLES.includes(role);
  const errors = {
    name: !name.trim() ? 'Informe o nome.' : undefined,
    email: !email.trim() ? 'Informe o e-mail.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'E-mail inválido.' : undefined,
    password: password.length < 8 ? 'A senha precisa ter ao menos 8 caracteres.' : undefined,
    passwordConfirm: password !== passwordConfirm ? 'As senhas não conferem.' : undefined,
    scope: isGestor && (scopedUnitIds.length === 0 || setoresDoPerfil(role, sectors, scopedSectorIds).length === 0 || scopedShifts.length === 0)
      ? 'Selecione ao menos uma unidade, um setor e um turno.'
      : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) { setAttempted(true); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          name, email, password, role,
          leaderArea: role === 'GESTOR_LIDER' ? (leaderArea || null) : undefined,
          scopedUnitIds: isGestor ? scopedUnitIds : undefined,
          scopedSectorIds: isGestor ? setoresDoPerfil(role, sectors, scopedSectorIds) : undefined,
          scopedShifts: isGestor ? scopedShifts : undefined,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const show = (k: keyof typeof errors) => (attempted ? errors[k] : undefined);

  return (
    <ModalShell
      title="Novo usuário"
      subtitle="Gestor, Líder ou administrador."
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      submitLabel="Criar usuário"
    >
      <Section title="Dados pessoais">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome" error={show('name')} htmlFor="admin-name">
            <input id="admin-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="E-mail" error={show('email')} htmlFor="admin-email">
            <input id="admin-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Perfil e permissões">
        <RoleField value={role} onChange={setRole} />
        {role === 'GESTOR_LIDER' && <AreaField value={leaderArea} onChange={setLeaderArea} />}
        {isGestor && (
          <>
            <ScopeFields
              units={units}
              sectors={sectors}
              unitIds={scopedUnitIds}
              sectorIds={setoresDoPerfil(role, sectors, scopedSectorIds)}
              shifts={scopedShifts}
              role={role}
              onUnits={setScopedUnitIds}
              onSectors={setScopedSectorIds}
              onShifts={setScopedShifts}
            />
            {show('scope') && <p className="text-xs text-spot-danger">{errors.scope}</p>}
          </>
        )}
        {role === 'TREINADOR' && (
          <p className="text-xs text-spot-gray-500 bg-spot-gray-50 border border-spot-gray-200 rounded-btn px-3 py-2">
            O Treinador acessa apenas a área de Treinamento, e só enxerga os colaboradores das lojas, setores e turnos
            marcados acima. Para mudar o setor dele depois, é só editar o usuário.
          </p>
        )}
      </Section>

      <Section title="Dados de acesso">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <PasswordField label="Senha" value={password} onChange={setPassword} />
            {show('password') && <p className="text-xs text-spot-danger mt-1">{errors.password}</p>}
          </div>
          <Field label="Confirmar senha" error={show('passwordConfirm')} htmlFor="admin-password-confirm">
            <input
              id="admin-password-confirm"
              type="password"
              className="input"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {error && <p className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
    </ModalShell>
  );
}

export function EditAdminModal({
  admin, sectors, units, onClose, onSaved,
}: { admin: AccessUser; sectors: Lookup[]; units: Lookup[]; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(admin.email);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(admin.role as UserRole);
  const [leaderArea, setLeaderArea] = useState<LeaderArea | ''>(admin.leaderArea ?? '');
  const [scopedUnitIds, setScopedUnitIds] = useState<string[]>(admin.scopedUnits.map((u) => u.id));
  const [scopedSectorIds, setScopedSectorIds] = useState<string[]>(admin.scopedSectors.map((s) => s.id));
  const [scopedShifts, setScopedShifts] = useState<string[]>(admin.scopedShifts ?? []);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGestor = SCOPED_ROLES.includes(role);
  const errors = {
    email: !email.trim() ? 'Informe o e-mail.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'E-mail inválido.' : undefined,
    password: password && password.length < 8 ? 'A senha precisa ter ao menos 8 caracteres.' : undefined,
    scope: isGestor && (scopedUnitIds.length === 0 || setoresDoPerfil(role, sectors, scopedSectorIds).length === 0 || scopedShifts.length === 0)
      ? 'Selecione ao menos uma unidade, um setor e um turno.'
      : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (attempted ? errors[k] : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) { setAttempted(true); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/admins/${admin.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email,
          role,
          ...(role === 'GESTOR_LIDER' ? { leaderArea: leaderArea || null } : {}),
          password: password || undefined,
          ...(isGestor ? { scopedUnitIds, scopedSectorIds: setoresDoPerfil(role, sectors, scopedSectorIds), scopedShifts } : {}),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={`Editar ${admin.name}`}
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      submitLabel="Salvar"
    >
      <Section title="Perfil e permissões">
        <RoleField value={role} onChange={setRole} />
        {role === 'GESTOR_LIDER' && <AreaField value={leaderArea} onChange={setLeaderArea} />}
        {isGestor && (
          <>
            <ScopeFields
              units={units}
              sectors={sectors}
              unitIds={scopedUnitIds}
              sectorIds={setoresDoPerfil(role, sectors, scopedSectorIds)}
              shifts={scopedShifts}
              role={role}
              onUnits={setScopedUnitIds}
              onSectors={setScopedSectorIds}
              onShifts={setScopedShifts}
            />
            {show('scope') && <p className="text-xs text-spot-danger">{errors.scope}</p>}
          </>
        )}
        {role === 'TREINADOR' && (
          <p className="text-xs text-spot-gray-500 bg-spot-gray-50 border border-spot-gray-200 rounded-btn px-3 py-2">
            O Treinador acessa apenas a área de Treinamento, e só enxerga os colaboradores das lojas, setores e turnos
            marcados acima. Para mudar o setor dele depois, é só editar o usuário.
          </p>
        )}
      </Section>

      <Section title="Dados de acesso">
        <Field label="E-mail (login)" error={show('email')} htmlFor="edit-email">
          <input id="edit-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div>
          <PasswordField
            label="Redefinir senha (opcional)"
            value={password}
            onChange={setPassword}
            placeholder="Deixe em branco para manter a atual"
          />
          {show('password') && <p className="text-xs text-spot-danger mt-1">{errors.password}</p>}
          <p className="text-xs text-spot-gray-500 mt-1">
            A senha atual fica criptografada e não pode ser exibida — para ver a senha de {admin.name}, gere uma nova aqui.
          </p>
        </div>
      </Section>

      {error && <p className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>}
    </ModalShell>
  );
}
