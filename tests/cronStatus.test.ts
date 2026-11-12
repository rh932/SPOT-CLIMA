import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));

const { cronHealth, CRON_STALE_HOURS } = await import('@/lib/cronStatus');
const { notificationPayload } = await import('@/lib/pushPayload');
const { systemSettingSchema } = await import('@/lib/validation');

describe('vigia da rotina diária', () => {
  const agora = new Date('2026-10-08T15:00:00Z');
  const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

  it('sem registro, falhou, atrasada e ok', () => {
    expect(cronHealth(null, agora)).toBe('NUNCA_RODOU');
    expect(cronHealth({ at: horasAtras(1), ok: false, erro: 'x' }, agora)).toBe('FALHOU');
    expect(cronHealth({ at: horasAtras(CRON_STALE_HOURS + 1), ok: true }, agora)).toBe('ATRASADA');
    expect(cronHealth({ at: horasAtras(20), ok: true }, agora)).toBe('OK');
  });

  it('o alerta leva para Configurações e não carrega dado de funcionário', () => {
    const p = notificationPayload({ type: 'SYSTEM_ALERT', employeeId: null, message: 'A rotina falhou.', portal: 'admin' });
    expect(p.title).toBe('Spot Integra — alerta do sistema');
    expect(p.url).toBe('/admin/settings#rotina');
  });

  it('a tela de configurações não consegue gravar o status da rotina', () => {
    expect(systemSettingSchema.safeParse({ key: 'cron.avisos.ultimaExecucao', value: { ok: true } }).success).toBe(false);
    expect(systemSettingSchema.safeParse({ key: 'CRON.x', value: 1 }).success).toBe(false);
    expect(systemSettingSchema.safeParse({ key: 'companyName', value: 'Spot' }).success).toBe(true);
  });
});
