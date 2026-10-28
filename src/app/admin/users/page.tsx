'use client';

/**
 * Usuários e acessos — saiu da tela de Configurações, onde a lista era um
 * bloco de texto corrido com nome, e-mail e escopo na mesma linha.
 *
 * O que ela responde: quem tem conta, com que perfil e recorte, e quem ainda
 * não fez o primeiro login (a lista de cobrança do RH depois de criar as
 * contas dos gestores). Cada linha copia a mensagem de acesso pronta para
 * encaminhar — sem a senha, que vai separada.
 */

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  AsyncSection, EmptyState, RefreshingBar, SkeletonCardList, useAsyncData, useConfirm, useToast,
} from '@/components/async';
import {
  accessMessage, accessOf, EMPTY_USER_FILTERS, groupMessage, matchesUserFilters, ROLE_LABEL, SCOPED_ROLES, sortUsers,
  type AccessFilter, type AccessUser, type UserFilters, type UserRole,
} from '@/lib/userAccess';
import { CreateAdminModal, EditAdminModal } from './UserModals';

interface Lookup { id: string; name: string }
interface SectorLookup extends Lookup { inEvaluation: boolean; inTraining: boolean }

const SHIFT_LABEL: Record<'DIA' | 'NOITE', string> = { DIA: 'Diurno', NOITE: 'Noturno' };

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const nomes = (xs: Lookup[]) => (xs.length ? [...xs].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((x) => x.name).join(', ') : '—');

function Selecao({
  rotulo, value, onChange, children,
}: { rotulo: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">{rotulo}</span>
      <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </label>
  );
}

function Acesso({ u }: { u: AccessUser }) {
  const a = accessOf(u);
  if (a === 'INATIVO') return <span className="text-spot-gray-500">Conta inativa</span>;
  if (a === 'PENDENTE') {
    return (
      <span className="inline-flex flex-col leading-tight">
        <span className="inline-flex items-center gap-1.5 font-semibold text-spot-gray-900">
          <span aria-hidden className="h-2 w-2 rounded-full bg-spot-yellow" />
          Pendente do 1º login
        </span>
        {u.firstAccessCode && (
          <span className="text-xs text-spot-gray-500">
            código <span className="font-mono tracking-[0.1em] text-spot-gray-800">{u.firstAccessCode}</span>
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: '#0F7A3D' }} />
        Já entrou
      </span>
      <span className="text-xs text-spot-gray-500">último acesso {quando(u.lastLoginAt!)}</span>
      {u.mfaEnabledAt && <span className="text-xs text-spot-gray-500">verificação em duas etapas ligada</span>}
    </span>
  );
}

export default function UsersPage() {
  const { mostrar } = useToast();
  const confirmar = useConfirm();
  const [filtros, setFiltros] = useState<UserFilters>(EMPTY_USER_FILTERS);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<AccessUser | null>(null);

  const { data, loading, reloading, error, forbidden, reload } = useAsyncData(
    async (signal) => {
      const [a, sec, uni, me] = await Promise.all([
        apiFetch<{ admins: AccessUser[] }>('/api/admin/admins', { signal }),
        apiFetch<{ sectors: SectorLookup[] }>('/api/admin/sectors', { signal }),
        apiFetch<{ units: Lookup[] }>('/api/admin/units', { signal }),
        apiFetch<{ admin?: { adminId?: string } }>('/api/auth/me', { signal }),
      ]);
      // Escopo de gestor/treinador é recorte de avaliação: setor que é só da
      // pesquisa (Administração) não entra — vale a área (ex.: Administração - RH).
      return { admins: a.admins, sectors: sec.sectors.filter((s) => s.inEvaluation), units: uni.units, meuId: me.admin?.adminId ?? null };
    },
    [],
    { mensagemPadrao: 'Erro ao carregar os usuários. Só o Super Admin gerencia usuários.' },
  );
  const usuarios = useMemo(() => data?.admins ?? [], [data]);
  const units = data?.units ?? [];
  const sectors = data?.sectors ?? [];

  const visiveis = useMemo(() => sortUsers(usuarios.filter((u) => matchesUserFilters(u, filtros))), [usuarios, filtros]);
  // Contadores do recorte sem o filtro de acesso: é ele que os chips trocam.
  const semAcesso = usuarios.filter((u) => matchesUserFilters(u, { ...filtros, access: '' }));
  const conta = (a: AccessFilter) => semAcesso.filter((u) => accessOf(u) === a).length;
  const mudar = (p: Partial<UserFilters>) => setFiltros((f) => ({ ...f, ...p }));
  const temFiltro = JSON.stringify(filtros) !== JSON.stringify(EMPTY_USER_FILTERS);

  const copiarMensagem = async (u: AccessUser) => {
    const texto = accessMessage(u, window.location.origin);
    try {
      await navigator.clipboard.writeText(texto);
      mostrar(u.firstAccessCode
        ? `Mensagem de ${u.name.split(' ')[0]} copiada, com o link para criar a senha.`
        : `Mensagem de ${u.name.split(' ')[0]} copiada.`);
    } catch {
      window.prompt('Copie a mensagem:', texto);
    }
  };

  // Mensagem única para o grupo do WhatsApp: sem link nem código de ninguém.
  const copiarGrupo = async () => {
    const texto = groupMessage(window.location.origin);
    try {
      await navigator.clipboard.writeText(texto);
      mostrar('Mensagem do grupo copiada. Depois mande o link de cada um no privado, pelo "Copiar mensagem".');
    } catch {
      window.prompt('Copie a mensagem:', texto);
    }
  };

  const excluir = async (u: AccessUser) => {
    if (!(await confirmar({ titulo: `Excluir o usuário "${u.name}"?`, texto: 'A pessoa perde o acesso na hora.', acao: 'Excluir usuário', perigo: true }))) return;
    try {
      await apiFetch(`/api/admin/admins/${u.id}`, { method: 'DELETE' });
      mostrar(`${u.name} excluído.`);
      await reload();
    } catch (err) {
      mostrar(err instanceof Error ? err.message : 'Erro ao excluir o usuário.');
    }
  };

  // Quem perdeu o celular e os códigos de recuperação: volta a entrar só com a senha.
  const zerarDuasEtapas = async (u: AccessUser) => {
    if (!(await confirmar({
      titulo: `Desligar a verificação em duas etapas de "${u.name}"?`,
      texto: 'Use quando a pessoa perdeu o celular e os códigos de recuperação. Ela entra só com a senha e pode ligar de novo.',
      acao: 'Desligar',
      perigo: true,
    }))) return;
    try {
      await apiFetch(`/api/admin/admins/${u.id}/mfa-reset`, { method: 'POST' });
      mostrar(`Verificação em duas etapas de ${u.name.split(' ')[0]} desligada.`);
      await reload();
    } catch (err) {
      mostrar(err instanceof Error ? err.message : 'Não foi possível desligar.');
    }
  };

  const acoes = (u: AccessUser) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={() => copiarMensagem(u)} aria-label={`Copiar a mensagem de acesso de ${u.name}`}>
        Copiar mensagem
      </button>
      <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={() => setEditando(u)} aria-label={`Editar ${u.name}`}>
        Editar
      </button>
      {u.mfaEnabledAt && u.id !== data?.meuId && (
        <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={() => zerarDuasEtapas(u)} aria-label={`Desligar a verificação em duas etapas de ${u.name}`}>
          Desligar 2 etapas
        </button>
      )}
      {u.id !== data?.meuId && (
        <button type="button" className="btn-ghost text-xs py-1.5 px-3 text-spot-danger" onClick={() => excluir(u)} aria-label={`Excluir ${u.name}`}>
          Excluir
        </button>
      )}
    </div>
  );

  const escopo = (u: AccessUser) => (SCOPED_ROLES.includes(u.role) ? (
    <span className="text-sm leading-snug">
      {nomes(u.scopedUnits)}
      <span className="block text-xs text-spot-gray-500">
        {nomes(u.scopedSectors)} · {u.scopedShifts.length ? u.scopedShifts.map((s) => SHIFT_LABEL[s]).join(' e ') : '—'}
      </span>
    </span>
  ) : <span className="text-sm text-spot-gray-500">Todas as lojas</span>);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Usuários</h1>
          <p className="text-spot-gray-500 text-sm">Quem acessa o painel e o portal da operação, e quem ainda não entrou.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={copiarGrupo}>Copiar mensagem do grupo</button>
          <button className="btn-primary" onClick={() => setCriando(true)}>+ Novo usuário</button>
        </div>
      </div>

      <RefreshingBar visible={reloading} texto="Atualizando a lista..." />

      <AsyncSection
        loading={loading}
        error={error}
        forbidden={forbidden}
        onRetry={reload}
        retrying={reloading}
        rotulo="os usuários"
        skeleton={<SkeletonCardList rows={6} />}
        empty={usuarios.length === 0}
        emptyState={<EmptyState>Nenhum usuário cadastrado.</EmptyState>}
      >
        <div className="flex flex-col gap-5">
          {/* Situação do acesso — o recorte que o RH mais usa. */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Situação do acesso">
            {([
              ['', `Todos (${semAcesso.length})`],
              ['PENDENTE', `Pendentes do 1º login (${conta('PENDENTE')})`],
              ['ENTROU', `Já entraram (${conta('ENTROU')})`],
              ...(conta('INATIVO') > 0 ? [['INATIVO', `Inativos (${conta('INATIVO')})`]] : []),
            ] as [AccessFilter, string][]).map(([valor, rotulo]) => (
              <button
                key={valor || 'todos'}
                type="button"
                aria-pressed={filtros.access === valor}
                onClick={() => mudar({ access: valor })}
                className={`badge min-h-10 transition ${filtros.access === valor ? 'bg-spot-black text-spot-onBlack' : 'bg-spot-gray-100 text-spot-gray-600 hover:bg-spot-gray-200'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block min-w-0">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Buscar</span>
              <input type="search" className="input mt-1" placeholder="Nome ou e-mail" value={filtros.q} onChange={(e) => mudar({ q: e.target.value })} />
            </label>
            <Selecao rotulo="Perfil" value={filtros.role} onChange={(v) => mudar({ role: v as UserRole | '' })}>
              <option value="">Todos</option>
              {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Selecao>
            <Selecao rotulo="Loja" value={filtros.unit} onChange={(v) => mudar({ unit: v })}>
              <option value="">Todas</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Selecao>
            <Selecao rotulo="Setor" value={filtros.sector} onChange={(v) => mudar({ sector: v })}>
              <option value="">Todos</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Selecao>
          </div>
          {temFiltro && (
            <button type="button" className="self-start text-sm text-spot-gray-500 hover:text-spot-gray-900 underline underline-offset-4 min-h-10" onClick={() => setFiltros(EMPTY_USER_FILTERS)}>
              Limpar filtros
            </button>
          )}

          {visiveis.length === 0 ? (
            <p className="py-10 text-center text-spot-gray-500">Ninguém com esses filtros.</p>
          ) : (
            <>
              {/* Computador: tabela, uma pessoa por linha. */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Usuários, {visiveis.length} na lista</caption>
                  <thead>
                    <tr className="text-left text-spot-gray-500 border-b border-spot-gray-200 font-mono text-[11px] uppercase tracking-[0.08em]">
                      <th scope="col" className="py-2 pr-4 font-normal">Usuário</th>
                      <th scope="col" className="py-2 pr-4 font-normal">Perfil</th>
                      <th scope="col" className="py-2 pr-4 font-normal">Loja · setor · turno</th>
                      <th scope="col" className="py-2 pr-4 font-normal">Acesso</th>
                      <th scope="col" className="py-2 font-normal"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((u) => (
                      <tr key={u.id} className="border-b border-spot-gray-100 align-top">
                        <td className="py-3.5 pr-4">
                          <p className="font-semibold">{u.name}</p>
                          <p className="text-xs text-spot-gray-500 break-all">{u.email}</p>
                        </td>
                        <td className="py-3.5 pr-4 whitespace-nowrap">{ROLE_LABEL[u.role]}</td>
                        <td className="py-3.5 pr-4">{escopo(u)}</td>
                        <td className="py-3.5 pr-4"><Acesso u={u} /></td>
                        <td className="py-3 text-right">{acoes(u)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Celular: um bloco por pessoa. */}
              <div className="md:hidden [&>*:last-child]:border-b-0">
                {visiveis.map((u) => (
                  <div key={u.id} className="py-4 border-b border-spot-gray-200 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{u.name}</p>
                        <p className="text-xs text-spot-gray-500 break-all">{u.email}</p>
                      </div>
                      <span className="badge bg-spot-gray-100 text-spot-gray-700 shrink-0">{ROLE_LABEL[u.role]}</span>
                    </div>
                    {escopo(u)}
                    <div className="text-sm"><Acesso u={u} /></div>
                    {acoes(u)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </AsyncSection>

      {criando && (
        <CreateAdminModal
          sectors={sectors}
          units={units}
          onClose={() => setCriando(false)}
          onCreated={async () => { setCriando(false); mostrar('Usuário criado. Use "Copiar mensagem" para mandar o link de primeiro acesso.'); await reload(); }}
        />
      )}
      {editando && (
        <EditAdminModal
          admin={editando}
          sectors={sectors}
          units={units}
          onClose={() => setEditando(null)}
          onSaved={async () => { setEditando(null); mostrar('Usuário atualizado.'); await reload(); }}
        />
      )}
    </div>
  );
}
