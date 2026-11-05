export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError } from '@/lib/apiAuth';
import { ADMIN_ROLES } from '@/lib/permissions';
import { cycleFieldsFor, findDuplicate, normalizeName } from '@/lib/employeeCreate';
import { MAX_IMPORT_EMPLOYEES } from '@/lib/importFuncionarios';
import { logAudit } from '@/lib/audit';

const idSchema = z.string().min(1).max(64);

/**
 * As linhas voltam do navegador depois da prévia, então nada aqui é confiável:
 * ids de unidade/setor e duplicidades são conferidos de novo contra o banco.
 */
const confirmSchema = z.object({
  rows: z.array(z.object({
    line: z.number().int().optional(),
    fullName: z.string().trim().min(2).max(160),
    roleDescription: z.string().trim().min(2).max(300),
    admissionDate: z.string().datetime().nullable(),
    unitId: idSchema,
    sectorId: idSchema,
    shift: z.enum(['DIA', 'NOITE']),
    track: z.enum(['NOVO', 'ATIVO']),
  })).min(1).max(MAX_IMPORT_EMPLOYEES),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requireRole(session, ADMIN_ROLES);
    requirePermission(session, 'employees.create');

    const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Nenhuma linha válida para importar.' }, { status: 400 });

    const [units, sectors, existing] = await Promise.all([
      db.query.units.findMany({ where: eq(schema.units.active, true), columns: { id: true } }),
      db.query.sectors.findMany({
        where: and(eq(schema.sectors.active, true), eq(schema.sectors.inEvaluation, true)),
        columns: { id: true },
      }),
      db.query.probationaryEmployees.findMany({
        where: inArray(schema.probationaryEmployees.unitId, [...new Set(parsed.data.rows.map((r) => r.unitId))]),
        columns: { fullName: true, unitId: true },
      }),
    ]);
    const unitIds = new Set(units.map((u) => u.id));
    const sectorIds = new Set(sectors.map((s) => s.id));

    const aGravar: (typeof schema.probationaryEmployees.$inferInsert)[] = [];
    const ignorados: { line?: number; fullName: string; motivo: string }[] = [];
    const entrando = new Set<string>();

    for (const r of parsed.data.rows) {
      if (!unitIds.has(r.unitId) || !sectorIds.has(r.sectorId)) {
        ignorados.push({ line: r.line, fullName: r.fullName, motivo: 'Unidade ou setor inválido.' });
        continue;
      }
      const chave = `${r.unitId}|${normalizeName(r.fullName)}`;
      if (findDuplicate(existing, r) || entrando.has(chave)) {
        ignorados.push({ line: r.line, fullName: r.fullName, motivo: 'Já cadastrado — não foi alterado.' });
        continue;
      }
      if (r.track === 'NOVO' && !r.admissionDate) {
        ignorados.push({ line: r.line, fullName: r.fullName, motivo: 'Colaborador novo sem data de admissão.' });
        continue;
      }
      entrando.add(chave);
      const admissionDate = r.admissionDate ? new Date(r.admissionDate) : new Date();
      aGravar.push({
        fullName: r.fullName,
        admissionDate,
        roleDescription: r.roleDescription,
        sectorId: r.sectorId,
        unitId: r.unitId,
        shift: r.shift,
        ...cycleFieldsFor(r.track, admissionDate),
        createdById: session.adminId,
      });
    }

    // Um único INSERT: ou entram todos os válidos, ou nenhum.
    if (aGravar.length > 0) await db.insert(schema.probationaryEmployees).values(aGravar);

    await logAudit({
      adminId: session.adminId,
      action: 'employee.import',
      entityType: 'ProbationaryEmployee',
      metadata: { importados: aGravar.length, ignorados: ignorados.length },
      req,
    });

    return NextResponse.json({ ok: true, importados: aGravar.length, ignorados });
  } catch (err) {
    return handleApiError(err);
  }
}
