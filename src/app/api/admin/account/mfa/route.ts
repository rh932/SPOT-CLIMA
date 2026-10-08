export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { requireAdmin, requireRole, handleApiError, ApiError } from '@/lib/apiAuth';
import { ADMIN_ROLES } from '@/lib/permissions';
import { seal } from '@/lib/secretBox';
import { generateTotpSecret, otpauthUri } from '@/lib/totp';
import { SECRET_PURPOSE, consumeSecondFactor, generateRecoveryCodes, remainingRecoveryCodes } from '@/lib/mfa';
import { verifyPasswordConstantTime } from '@/lib/password';
import { mfaCodeSchema, mfaDisableSchema, mfaSetupSchema } from '@/lib/validation';
import { consumeRateLimit, isRateLimited } from '@/lib/rateLimit';
import { logAudit } from '@/lib/audit';

/**
 * Verificação em duas etapas da PRÓPRIA conta (painel administrativo).
 *
 * GET  → situação (ligada? quantos códigos de recuperação sobram?)
 * POST { action: 'setup', password }   → confere a senha, gera segredo pendente + QR code
 * POST { action: 'enable', code }       → confirma o 1º código e liga; devolve os códigos de recuperação
 * POST { action: 'recovery', code }     → gera códigos de recuperação novos (os antigos deixam de valer)
 * POST { action: 'disable', password, code } → desliga
 */

async function loadAccount(adminId: string) {
  const conta = await db.query.admins.findFirst({ where: eq(schema.admins.id, adminId) });
  if (!conta) throw new ApiError(401, 'Não autenticado.');
  return conta;
}

/** Tentativa de código errado conta no mesmo teto do login: a tela de configuração não vira atalho para adivinhar. */
async function limitarTentativas(adminId: string) {
  const [r, diaEstourado] = await Promise.all([
    consumeRateLimit('mfa-conta', adminId, 5, 15 * 60 * 1000),
    isRateLimited('mfa-conta-dia', adminId, 20),
  ]);
  if (diaEstourado) throw new ApiError(429, 'Muitos códigos errados nas últimas 24 horas. Tente de novo amanhã.');
  if (!r.allowed) throw new ApiError(429, 'Muitas tentativas. Espere alguns minutos.');
}

/** Código errado também conta no teto diário do login (src/app/api/auth/mfa/verify/route.ts). */
async function codigoErrado(adminId: string, mensagem: string): Promise<never> {
  await consumeRateLimit('mfa-conta-dia', adminId, 20, 24 * 60 * 60 * 1000);
  throw new ApiError(400, mensagem);
}

export async function GET() {
  try {
    const session = await requireAdmin();
    requireRole(session, ADMIN_ROLES);
    const conta = await loadAccount(session.adminId);
    return NextResponse.json({
      enabled: Boolean(conta.mfaEnabledAt && conta.mfaSecret),
      enabledAt: conta.mfaEnabledAt,
      recoveryLeft: remainingRecoveryCodes(conta.mfaRecoveryCodes),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    requireRole(session, ADMIN_ROLES);
    const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
    const action = body?.action;
    const conta = await loadAccount(session.adminId);
    const ligada = Boolean(conta.mfaEnabledAt && conta.mfaSecret);

    if (action === 'setup') {
      if (ligada) throw new ApiError(409, 'A verificação em duas etapas já está ligada.');
      const parsed = mfaSetupSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(400, 'Confirme a sua senha.');
      await limitarTentativas(conta.id);
      if (!(await verifyPasswordConstantTime(parsed.data.password, conta.passwordHash))) {
        throw new ApiError(400, 'Senha incorreta.');
      }
      const secret = generateTotpSecret();
      await db.update(schema.admins)
        .set({ mfaPendingSecret: seal(secret, SECRET_PURPOSE), updatedAt: new Date() })
        .where(eq(schema.admins.id, conta.id));
      const uri = otpauthUri(secret, conta.email);
      const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
      // O segredo vai para a tela uma vez (QR + texto para digitar à mão) e só.
      return NextResponse.json({ qrDataUrl, secret: secret.replace(/(.{4})/g, '$1 ').trim() });
    }

    if (action === 'enable') {
      if (ligada) throw new ApiError(409, 'A verificação em duas etapas já está ligada.');
      const parsed = mfaCodeSchema.safeParse(body);
      if (!parsed.success || !conta.mfaPendingSecret) throw new ApiError(400, 'Gere o QR code e digite o código do app.');
      await limitarTentativas(conta.id);
      const ok = await consumeSecondFactor(conta.id, conta.mfaPendingSecret, conta.mfaLastStep, parsed.data.code, {
        allowRecovery: false,
      });
      if (!ok.ok) await codigoErrado(conta.id, 'Código não confere. Confira se o horário do celular está automático e tente o código novo.');
      const { codes, hashes } = generateRecoveryCodes();
      // Só liga se ainda está desligada e o segredo pendente é o mesmo que foi
      // conferido: duas abas confirmando ao mesmo tempo não trocam o segredo
      // de quem acabou de ligar (nem geram dois jogos de códigos).
      const [ligou] = await db.update(schema.admins)
        .set({
          mfaSecret: conta.mfaPendingSecret,
          mfaPendingSecret: null,
          mfaEnabledAt: new Date(),
          mfaRecoveryCodes: hashes,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.admins.id, conta.id),
          isNull(schema.admins.mfaEnabledAt),
          eq(schema.admins.mfaPendingSecret, conta.mfaPendingSecret),
        ))
        .returning({ id: schema.admins.id });
      if (!ligou) throw new ApiError(409, 'A verificação em duas etapas já foi ligada em outra tela. Recarregue a página.');
      await logAudit({ adminId: conta.id, action: 'mfa.enable', entityType: 'Admin', entityId: conta.id, req });
      return NextResponse.json({ ok: true, recoveryCodes: codes });
    }

    if (action === 'recovery') {
      if (!ligada) throw new ApiError(409, 'Ligue a verificação em duas etapas primeiro.');
      const parsed = mfaCodeSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(400, 'Digite o código do app.');
      await limitarTentativas(conta.id);
      const ok = await consumeSecondFactor(conta.id, conta.mfaSecret, conta.mfaLastStep, parsed.data.code, {
        allowRecovery: false,
      });
      if (!ok.ok) await codigoErrado(conta.id, 'Código inválido ou já usado.');
      const { codes, hashes } = generateRecoveryCodes();
      await db.update(schema.admins)
        .set({ mfaRecoveryCodes: hashes, updatedAt: new Date() })
        .where(eq(schema.admins.id, conta.id));
      await logAudit({ adminId: conta.id, action: 'mfa.recovery_regenerated', entityType: 'Admin', entityId: conta.id, req });
      return NextResponse.json({ ok: true, recoveryCodes: codes });
    }

    if (action === 'disable') {
      if (!ligada) return NextResponse.json({ ok: true });
      const parsed = mfaDisableSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(400, 'Informe a senha e um código.');
      await limitarTentativas(conta.id);
      const senhaOk = await verifyPasswordConstantTime(parsed.data.password, conta.passwordHash);
      if (!senhaOk) throw new ApiError(400, 'Senha incorreta.');
      const ok = await consumeSecondFactor(conta.id, conta.mfaSecret, conta.mfaLastStep, parsed.data.code, {
        allowRecovery: true,
      });
      if (!ok.ok) await codigoErrado(conta.id, 'Código inválido ou já usado.');
      await db.update(schema.admins)
        .set({
          mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: new Date(),
        })
        .where(eq(schema.admins.id, conta.id));
      await logAudit({ adminId: conta.id, action: 'mfa.disable', entityType: 'Admin', entityId: conta.id, req });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError(400, 'Ação inválida.');
  } catch (err) {
    return handleApiError(err);
  }
}

