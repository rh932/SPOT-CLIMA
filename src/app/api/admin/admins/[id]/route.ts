export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError, assertTrainerSectors } from '@/lib/apiAuth';
import { updateAdminSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);

    const body = await req.json().catch(() => null);
    const parsed = updateAdminSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const existing = await db.query.admins.findFirst({ where: eq(schema.admins.id, params.id) });
    if (!existing) return NextResponse.json({ error: 'Administrador não encontrado.' }, { status: 404 });

    const [existingUnitRows, existingSectorRows, existingShiftRows] = await Promise.all([
      db.query.adminUnits.findMany({ where: eq(schema.adminUnits.adminId, params.id), columns: { unitId: true } }),
      db.query.adminSectors.findMany({ where: eq(schema.adminSectors.adminId, params.id), columns: { sectorId: true } }),
      db.query.adminShifts.findMany({ where: eq(schema.adminShifts.adminId, params.id), columns: { shift: true } }),
    ]);
    const existingUnitIds = existingUnitRows.map((u) => u.unitId);
    const existingSectorIds = existingSectorRows.map((s) => s.sectorId);
    const existingShifts = existingShiftRows.map((s) => s.shift);

    const nextRole = parsed.data.role ?? existing.role;
    const nextActive = parsed.data.active ?? existing.active;
    // Mesma regra do DELETE (que já barrava excluir a si mesmo): ninguém muda
    // o próprio papel nem desativa a própria conta. Um clique errado não
    // tranca o Super Admin fora, e a mudança de privilégio sempre tem outra
    // pessoa por trás.
    if (session.adminId === existing.id && (nextRole !== existing.role || !nextActive)) {
      return NextResponse.json({ error: 'Você não pode alterar o próprio papel nem desativar a própria conta.' }, { status: 400 });
    }
    if (existing.role === 'SUPER_ADMIN' && existing.active && (nextRole !== 'SUPER_ADMIN' || !nextActive)) {
      const superAdmins = await db.query.admins.findMany({
        where: eq(schema.admins.role, 'SUPER_ADMIN'),
        columns: { id: true, active: true },
      });
      if (superAdmins.filter((a) => a.active && a.id !== existing.id).length === 0) {
        return NextResponse.json({ error: 'Não é possível rebaixar ou desativar o último Super Admin ativo.' }, { status: 400 });
      }
    }

    const nextUnitIds = parsed.data.scopedUnitIds !== undefined ? parsed.data.scopedUnitIds : existingUnitIds;
    const nextSectorIds = parsed.data.scopedSectorIds !== undefined ? parsed.data.scopedSectorIds : existingSectorIds;
    const nextShifts = parsed.data.scopedShifts !== undefined ? parsed.data.scopedShifts : existingShifts;
    if (['GESTOR', 'GESTOR_LIDER', 'TREINADOR', 'GERENTE', 'GERENTE_AVALIADOR', 'GERENTE_TREINADOR'].includes(nextRole)
      && (nextUnitIds.length === 0 || nextSectorIds.length === 0 || nextShifts.length === 0)) {
      return NextResponse.json({ error: 'Selecione ao menos uma unidade, um setor e um turno.' }, { status: 400 });
    }

    await assertTrainerSectors(nextRole, nextSectorIds);

    const { password, email, scopedUnitIds, scopedSectorIds, scopedShifts, ...rest } = parsed.data;

    if (email && email.toLowerCase() !== existing.email) {
      const emailTaken = await db.query.admins.findFirst({ where: eq(schema.admins.email, email.toLowerCase()) });
      if (emailTaken) return NextResponse.json({ error: 'Este e-mail já está em uso por outro administrador.' }, { status: 409 });
    }

    const passwordHash = password ? await hashPassword(password) : undefined;

    // Conta e escopo numa transação só: se a gravação do escopo falhar, o
    // gestor não pode ficar com zero setores (estado que a validação acima
    // existe justamente para impedir).
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.admins)
        .set({
          ...rest,
          // A área só existe para Líder: trocar de perfil limpa o rótulo.
          ...(nextRole !== 'GESTOR_LIDER' ? { leaderArea: null } : {}),
          ...(email ? { email: email.toLowerCase() } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.admins.id, params.id))
        .returning();

      if (scopedUnitIds !== undefined) {
        await tx.delete(schema.adminUnits).where(eq(schema.adminUnits.adminId, params.id));
        const unitIds = [...new Set(scopedUnitIds)];
        if (unitIds.length > 0) {
          await tx.insert(schema.adminUnits).values(unitIds.map((unitId) => ({ adminId: params.id, unitId })));
        }
      }

      if (scopedSectorIds !== undefined) {
        await tx.delete(schema.adminSectors).where(eq(schema.adminSectors.adminId, params.id));
        const sectorIds = [...new Set(scopedSectorIds)];
        if (sectorIds.length > 0) {
          await tx.insert(schema.adminSectors).values(sectorIds.map((sectorId) => ({ adminId: params.id, sectorId })));
        }
      }

      if (scopedShifts !== undefined) {
        await tx.delete(schema.adminShifts).where(eq(schema.adminShifts.adminId, params.id));
        const shifts = [...new Set(scopedShifts)];
        if (shifts.length > 0) {
          await tx.insert(schema.adminShifts).values(shifts.map((shift) => ({ adminId: params.id, shift })));
        }
      }

      return updated;
    });

    // O que mudou, sem os valores sensíveis: "senha trocada" sim, a senha não.
    await logAudit({
      adminId: session.adminId,
      action: 'admin.update',
      entityType: 'Admin',
      entityId: row.id,
      metadata: {
        campos: Object.keys(parsed.data).filter((k) => k !== 'password'),
        novaCredencial: Boolean(password),
        ...(nextRole !== existing.role ? { papelDe: existing.role, papelPara: nextRole } : {}),
        ...(nextActive !== existing.active ? { ativo: nextActive } : {}),
      },
      req,
    });
    return NextResponse.json({ admin: { id: row.id, name: row.name, email: row.email, role: row.role, active: row.active } });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);

    if (session.adminId === params.id) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 });
    }

    const existing = await db.query.admins.findFirst({ where: eq(schema.admins.id, params.id) });
    if (!existing) return NextResponse.json({ error: 'Administrador não encontrado.' }, { status: 404 });

    if (existing.role === 'SUPER_ADMIN') {
      const otherSuperAdmins = await db.query.admins.findMany({
        where: eq(schema.admins.role, 'SUPER_ADMIN'),
        columns: { id: true, active: true },
      });
      if (otherSuperAdmins.filter((a) => a.active && a.id !== existing.id).length === 0) {
        return NextResponse.json({ error: 'Não é possível excluir o último Super Admin ativo.' }, { status: 400 });
      }
    }

    // Seguro: audit_logs, action_plans, question_templates, probationary_employees e
    // performance_evaluations referenciam admins com onDelete 'set null' — nada quebra.
    await db.delete(schema.admins).where(eq(schema.admins.id, params.id));
    await logAudit({ adminId: session.adminId, action: 'admin.delete', entityType: 'Admin', entityId: params.id, req });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
