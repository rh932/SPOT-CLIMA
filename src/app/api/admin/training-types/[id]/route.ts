export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { trainingTypeSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'trainings.manage');

    const body = await req.json().catch(() => null);
    const parsed = trainingTypeSchema.partial().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const [row] = await db.update(schema.trainingTypes).set(parsed.data)
      .where(eq(schema.trainingTypes.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Tipo de treinamento não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'trainingType.update', entityType: 'TrainingType', entityId: row.id, req });
    return NextResponse.json({ trainingType: row });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Desativa por padrão (preserva os treinamentos já registrados). Só apaga de
 * verdade com ?hard=true e quando nenhum treinamento usa o tipo — treinamento
 * feito é histórico do colaborador, não pode sumir junto.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'trainings.manage');

    if (req.nextUrl.searchParams.get('hard') === 'true') {
      const inUse = await db.query.trainings.findFirst({ where: eq(schema.trainings.trainingTypeId, params.id) });
      if (inUse) {
        return NextResponse.json(
          { error: 'Este tipo já tem treinamentos registrados e não pode ser excluído. Desative-o em vez disso.' },
          { status: 409 },
        );
      }
      const [row] = await db.delete(schema.trainingTypes).where(eq(schema.trainingTypes.id, params.id)).returning();
      if (!row) return NextResponse.json({ error: 'Tipo de treinamento não encontrado.' }, { status: 404 });

      await logAudit({ adminId: session.adminId, action: 'trainingType.delete', entityType: 'TrainingType', entityId: row.id, req });
      return NextResponse.json({ ok: true });
    }

    const [row] = await db.update(schema.trainingTypes).set({ active: false })
      .where(eq(schema.trainingTypes.id, params.id)).returning();
    if (!row) return NextResponse.json({ error: 'Tipo de treinamento não encontrado.' }, { status: 404 });

    await logAudit({ adminId: session.adminId, action: 'trainingType.deactivate', entityType: 'TrainingType', entityId: row.id, req });
    return NextResponse.json({ trainingType: row });
  } catch (err) {
    return handleApiError(err);
  }
}
