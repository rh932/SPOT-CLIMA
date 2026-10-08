export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { requireAdmin, requirePermission, handleApiError } from '@/lib/apiAuth';
import { systemSettingSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');
    const rows = await db.query.systemSettings.findMany();
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'settings.manage');
    const body = await req.json().catch(() => null);
    const parsed = systemSettingSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    await db
      .insert(schema.systemSettings)
      .values({ key: parsed.data.key, value: parsed.data.value as object })
      .onConflictDoUpdate({
        target: schema.systemSettings.key,
        set: { value: parsed.data.value as object, updatedAt: new Date() },
      });

    await logAudit({ adminId: session.adminId, action: 'setting.update', entityType: 'SystemSetting', entityId: parsed.data.key, req });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
