-- Alerta da rotina diária (src/lib/cronStatus.ts). IF NOT EXISTS: rodar de novo não falha.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SYSTEM_ALERT';
