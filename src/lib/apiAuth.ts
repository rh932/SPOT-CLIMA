import { getSession, SessionPayload } from './auth';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { fingerprintMatches } from './sessionFingerprint';
import { errorForLog } from './dbErrors';
import type { GestorScope, TreinadorScope } from './scope';
import {
  hasPermission, permissionsFor, GESTOR_PORTAL_ROLES, hasUnrestrictedScope,
  type PermissionKey, type Role,
} from './permissions';

const ADMIN_PORTAL_ROLES: Role[] = ['SUPER_ADMIN', 'RH'];

/**
 * Usado dentro das rotas /api/admin/*. Papel e estado da conta vêm do banco, não
 * do JWT: desativar ou rebaixar um admin precisa valer na requisição seguinte,
 * não só quando o token de 8h expirar.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession('admin');
  if (!session) {
    throw new ApiError(401, 'Não autenticado.');
  }

  const admin = await db.query.admins.findFirst({
    where: eq(schema.admins.id, session.adminId),
    columns: { id: true, role: true, active: true, passwordHash: true },
  });
  if (!admin || !admin.active) {
    throw new ApiError(401, 'Sua conta não está mais ativa. Entre novamente.');
  }
  assertSamePassword(session, admin.passwordHash);
  if (!ADMIN_PORTAL_ROLES.includes(admin.role as Role)) {
    throw new ApiError(403, 'Você não tem permissão para executar esta ação.');
  }

  return { ...session, role: admin.role };
}

/**
 * Autorização por permissão (RBAC), não por papel solto. É a checagem que vale:
 * mesmo que alguém chame a API direto, sem passar pela interface, cai aqui.
 */
export function requirePermission(session: SessionPayload, key: PermissionKey) {
  if (!hasPermission(session.role, key)) {
    throw new ApiError(403, 'Você não tem permissão para executar esta ação.');
  }
}

/** Para leituras usadas por mais de uma área (ex.: lista de setores no cadastro e na pesquisa). */
export function requireAnyPermission(session: SessionPayload, keys: PermissionKey[]) {
  if (!keys.some((key) => hasPermission(session.role, key))) {
    throw new ApiError(403, 'Você não tem permissão para executar esta ação.');
  }
}

export function requireRole(session: SessionPayload, roles: string[]) {
  if (!roles.includes(session.role)) {
    throw new ApiError(403, 'Você não tem permissão para executar esta ação.');
  }
}

export type GestorSession = SessionPayload & GestorScope;

/**
 * Usado dentro das rotas /api/gestor/* — reforço em profundidade além do middleware.
 *
 * O escopo (unidades/setores/turno) e o estado da conta vêm SEMPRE do banco, não
 * dos claims do JWT: o token dura 8h, e mudar o escopo de um gestor — ou desativar
 * a conta dele — precisa valer na requisição seguinte, não só no próximo login.
 * São duas leituras em tabelas minúsculas.
 */
export async function requireGestor(): Promise<GestorSession> {
  const session = await getSession('gestor');
  if (!session) {
    throw new ApiError(401, 'Não autenticado.');
  }

  const admin = await db.query.admins.findFirst({
    where: eq(schema.admins.id, session.adminId),
    columns: { id: true, role: true, active: true, passwordHash: true },
    with: {
      scopedUnits: { columns: { unitId: true } },
      scopedSectors: { columns: { sectorId: true } },
      scopedShifts: { columns: { shift: true } },
    },
  });

  if (!admin || !admin.active) {
    throw new ApiError(401, 'Sua conta não está mais ativa. Entre novamente.');
  }
  assertSamePassword(session, admin.passwordHash);
  // Gestor, Líder, Treinador e Super Admin compartilham o portal; o que cada
  // um pode fazer é decidido por `requirePermission` em cada rota.
  if (!GESTOR_PORTAL_ROLES.includes(admin.role as Role)) {
    throw new ApiError(403, 'Você não tem permissão para executar esta ação.');
  }

  // Quem enxerga a operação inteira (Super Admin) não tem linhas de escopo.
  // Em vez de um caso especial em cada rota, o escopo é preenchido com tudo
  // que existe — `isInScope`, `hasCompleteScope` e os `inArray` das consultas
  // continuam funcionando sem saber que existe um papel sem recorte.
  // A leitura é de duas tabelas minúsculas e só acontece para esse papel.
  if (hasUnrestrictedScope(admin.role)) {
    const [todasUnidades, todosSetores] = await Promise.all([
      db.query.units.findMany({ columns: { id: true } }),
      db.query.sectors.findMany({ columns: { id: true } }),
    ]);
    return {
      ...session,
      role: admin.role,
      scopedUnitIds: todasUnidades.map((u) => u.id),
      scopedSectorIds: todosSetores.map((s) => s.id),
      scopedShifts: ['DIA', 'NOITE'],
    };
  }

  return {
    ...session,
    role: admin.role,
    scopedUnitIds: admin.scopedUnits.map((u) => u.unitId),
    scopedSectorIds: admin.scopedSectors.map((s) => s.sectorId),
    scopedShifts: admin.scopedShifts.map((s) => s.shift),
  };
}

/**
 * A senha mudou depois que este token foi emitido (troca pelo RH, primeiro
 * acesso, redefinição): a sessão antiga não vale mais. Token sem a impressão
 * digital (emitido antes desta regra) também cai — é um novo login, uma vez.
 */
function assertSamePassword(session: SessionPayload, passwordHash: string) {
  if (!fingerprintMatches(session.pv, passwordHash)) {
    throw new ApiError(401, 'Sua sessão expirou. Entre novamente.');
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('[api]', errorForLog(err));
  return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
}

/**
 * Funcionário só pode ser cadastrado ou movido para um setor de avaliação
 * (sectors.inEvaluation). "Administração" fica só na pesquisa de clima; quem
 * trabalha lá vai para a área do seu gestor (Financeiro, RH, Compras...).
 */
export async function assertEvaluationSector(sectorId: string): Promise<void> {
  const sector = await db.query.sectors.findFirst({
    where: eq(schema.sectors.id, sectorId),
    columns: { inEvaluation: true },
  });
  if (!sector) throw new ApiError(400, 'Setor não encontrado.');
  if (!sector.inEvaluation) {
    throw new ApiError(400, 'Este setor é só da pesquisa de clima. Escolha a área do funcionário (ex.: Administração - RH).');
  }
}

/**
 * Setores do escopo que participam do treinamento (sectors.inTraining — o
 * Salão). É o recorte de tudo que é treinamento no portal da operação: a
 * lista de quem treinar, o registro da ficha e o histórico. Lista vazia quer
 * dizer "nenhum" — quem chama não pode passá-la a um inArray.
 */
export async function trainingSectorIds(scopedSectorIds: string[]): Promise<string[]> {
  if (scopedSectorIds.length === 0) return [];
  const rows = await db.query.sectors.findMany({
    where: and(eq(schema.sectors.inTraining, true), inArray(schema.sectors.id, scopedSectorIds)),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

/** O treinamento é só do Salão: colaborador de outro setor não é treinado. */
export async function assertTrainingSector(sectorId: string): Promise<void> {
  const sector = await db.query.sectors.findFirst({
    where: eq(schema.sectors.id, sectorId),
    columns: { inTraining: true },
  });
  if (!sector) throw new ApiError(400, 'Setor não encontrado.');
  if (!sector.inTraining) {
    throw new ApiError(403, 'O treinamento é só para os setores do Salão. Este colaborador é de outro setor.');
  }
}

/**
 * Escopo de um Treinador: todo setor marcado precisa participar do
 * treinamento. Validado na criação e na edição da conta, para que um id de
 * outro setor mandado na mão não amplie o que o treinador enxerga.
 */
export async function assertTrainerSectors(role: string, sectorIds: string[]): Promise<void> {
  if (role !== 'TREINADOR' || sectorIds.length === 0) return;
  const validos = await trainingSectorIds([...new Set(sectorIds)]);
  if (validos.length !== new Set(sectorIds).size) {
    throw new ApiError(400, 'O treinamento é só do Salão: o treinador só pode ser responsável por setores marcados como "Treinamento".');
  }
}
