export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin, requireRole, handleApiError, assertTrainerSectors } from '@/lib/apiAuth';
import { hashPassword } from '@/lib/auth';
import { createAdminSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { firstAccessCode, formatCode } from '@/lib/firstAccess';

export async function GET() {
  try {
    // Mesma exigência do POST/PATCH: a lista traz e-mail, papel e o escopo
    // inteiro de cada gestor — não é informação para qualquer admin.
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);
    const rows = await db.query.admins.findMany({
      columns: {
        id: true, name: true, email: true, role: true, leaderArea: true, active: true, createdAt: true, mfaEnabledAt: true,
        // Só para calcular o código de primeiro acesso; o hash não sai daqui.
        passwordHash: true,
      },
      with: {
        scopedUnits: { columns: { id: true }, with: { unit: { columns: { id: true, name: true } } } },
        scopedSectors: { columns: { id: true }, with: { sector: { columns: { id: true, name: true } } } },
        scopedShifts: { columns: { shift: true } },
      },
    });
    // Primeiro e último acesso vêm do histórico de auditoria (login.success),
    // que existe desde o começo: é o que separa 'pendente do 1º login' de quem já entrou.
    const logins = await db
      .select({
        adminId: schema.auditLogs.adminId,
        first: sql<Date>`min(${schema.auditLogs.createdAt})`.mapWith(schema.auditLogs.createdAt),
        last: sql<Date>`max(${schema.auditLogs.createdAt})`.mapWith(schema.auditLogs.createdAt),
      })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'login.success'))
      .groupBy(schema.auditLogs.adminId);
    const acesso = new Map(logins.map((l) => [l.adminId, l]));
    const admins = rows.map(({ passwordHash, ...a }) => ({
      ...a,
      // Código que o RH manda para a pessoa criar a própria senha (src/lib/firstAccess.ts).
      // Só existe enquanto a conta nunca entrou (duas etapas ligada = já entrou).
      firstAccessCode: a.active && !acesso.has(a.id) && !a.mfaEnabledAt ? formatCode(firstAccessCode(a.id, passwordHash)) : null,
      firstLoginAt: acesso.get(a.id)?.first ?? null,
      lastLoginAt: acesso.get(a.id)?.last ?? null,
      scopedUnits: a.scopedUnits.map((su) => su.unit),
      scopedSectors: a.scopedSectors.map((ss) => ss.sector),
      scopedShifts: a.scopedShifts.map((sh) => sh.shift),
    }));
    return NextResponse.json({ admins });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requireRole(session, ['SUPER_ADMIN']);

    const body = await req.json().catch(() => null);
    const parsed = createAdminSchema.safeParse(body);
    // Devolve a mensagem real do zod (ex.: "Gestor precisa de ao menos uma
    // unidade...") em vez de um "Dados inválidos." que não diz qual campo.
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const emailTaken = await db.query.admins.findFirst({ where: eq(schema.admins.email, email) });
    if (emailTaken) {
      return NextResponse.json({ error: 'Este e-mail já está em uso por outro administrador.' }, { status: 409 });
    }

    await assertTrainerSectors(parsed.data.role, parsed.data.scopedSectorIds ?? []);

    const passwordHash = await hashPassword(parsed.data.password);
    // Gestor, Líder e Treinador têm escopo; papéis administrativos não.
    const isGestor = ['GESTOR', 'GESTOR_LIDER', 'TREINADOR', 'GERENTE'].includes(parsed.data.role);

    // Conta e escopo numa transação só: um escopo inválido não pode deixar
    // para trás uma conta ativa sem vínculo nenhum.
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.admins)
        .values({
          name: parsed.data.name,
          email,
          passwordHash,
          role: parsed.data.role,
          leaderArea: parsed.data.role === 'GESTOR_LIDER' ? (parsed.data.leaderArea ?? null) : null,
        })
        .returning();

      const unitIds = [...new Set(parsed.data.scopedUnitIds ?? [])];
      const sectorIds = [...new Set(parsed.data.scopedSectorIds ?? [])];
      const shifts = [...new Set(parsed.data.scopedShifts ?? [])];
      if (isGestor && unitIds.length) {
        await tx.insert(schema.adminUnits).values(unitIds.map((unitId) => ({ adminId: created.id, unitId })));
      }
      if (isGestor && sectorIds.length) {
        await tx.insert(schema.adminSectors).values(sectorIds.map((sectorId) => ({ adminId: created.id, sectorId })));
      }
      if (isGestor && shifts.length) {
        await tx.insert(schema.adminShifts).values(shifts.map((shift) => ({ adminId: created.id, shift })));
      }
      return created;
    });

    await logAudit({ adminId: session.adminId, action: 'admin.create', entityType: 'Admin', entityId: row.id, req });
    return NextResponse.json({ admin: { id: row.id, name: row.name, email: row.email, role: row.role } }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
