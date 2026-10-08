export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq, isNotNull, max } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { requireAdmin, requirePermission, handleApiError, ApiError } from '@/lib/apiAuth';
import { accessCodeLink, generateAccessCodes, hashAccessCode } from '@/lib/accessCodes';
import { accessCodesGenerateSchema, accessCodesToggleSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

/**
 * Códigos de participação de uma pesquisa (ver survey_access_codes em src/db/schema.ts).
 *
 * GET   → quantos foram gerados, quantos já foram usados e se a pesquisa exige.
 * POST  { quantity } → gera um lote. Os códigos voltam UMA vez, com o QR de cada
 *       um, para imprimir; o banco guarda só o HMAC.
 * PATCH { requireAccessCode } → liga/desliga a exigência.
 */

async function loadSurvey(id: string) {
  const survey = await db.query.surveys.findFirst({
    where: eq(schema.surveys.id, id),
    columns: { id: true, name: true, status: true, requireAccessCode: true },
  });
  if (!survey) throw new ApiError(404, 'Pesquisa não encontrada.');
  return survey;
}

async function counts(surveyId: string) {
  const [total] = await db.select({ n: count(), batch: max(schema.surveyAccessCodes.batch) })
    .from(schema.surveyAccessCodes)
    .where(eq(schema.surveyAccessCodes.surveyId, surveyId));
  const [usados] = await db.select({ n: count() })
    .from(schema.surveyAccessCodes)
    .where(and(eq(schema.surveyAccessCodes.surveyId, surveyId), isNotNull(schema.surveyAccessCodes.usedOn)));
  return { total: total?.n ?? 0, used: usados?.n ?? 0, lastBatch: total?.batch ?? 0 };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await loadSurvey(params.id);
    const c = await counts(survey.id);
    return NextResponse.json({ requireAccessCode: survey.requireAccessCode, ...c, available: c.total - c.used });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await loadSurvey(params.id);
    if (survey.status === 'CLOSED' || survey.status === 'ARCHIVED') {
      throw new ApiError(400, 'Esta pesquisa já foi encerrada.');
    }
    const parsed = accessCodesGenerateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, 'Informe de 1 a 500 códigos por vez.');

    const { lastBatch } = await counts(survey.id);
    const batch = lastBatch + 1;
    const codes = generateAccessCodes(parsed.data.quantity);
    await db.insert(schema.surveyAccessCodes).values(
      codes.map((code) => ({ surveyId: survey.id, codeHash: hashAccessCode(survey.id, code), batch })),
    );

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const slips = await Promise.all(codes.map(async (code) => ({
      code,
      qr: await QRCode.toDataURL(accessCodeLink(origin, code), { margin: 1, width: 180, errorCorrectionLevel: 'M' }),
    })));

    await logAudit({
      adminId: session.adminId,
      action: 'survey.access_codes.generate',
      entityType: 'Survey',
      entityId: survey.id,
      metadata: { quantidade: codes.length, lote: batch },
      req,
    });
    return NextResponse.json({ batch, surveyName: survey.name, surveyUrl: `${origin.replace(/\/$/, '')}/survey`, slips });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    requirePermission(session, 'surveys.manage');
    const survey = await loadSurvey(params.id);
    const parsed = accessCodesToggleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, 'Dados inválidos.');

    if (parsed.data.requireAccessCode) {
      const c = await counts(survey.id);
      // Ligar sem código livre travaria a pesquisa para todo mundo.
      if (c.total - c.used === 0) throw new ApiError(400, 'Gere e imprima os códigos antes de exigir.');
    }
    await db.update(schema.surveys)
      .set({ requireAccessCode: parsed.data.requireAccessCode, updatedAt: new Date() })
      .where(eq(schema.surveys.id, survey.id));
    await logAudit({
      adminId: session.adminId,
      action: parsed.data.requireAccessCode ? 'survey.access_codes.require' : 'survey.access_codes.release',
      entityType: 'Survey',
      entityId: survey.id,
      req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
