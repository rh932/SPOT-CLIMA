'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import type { CronHealth } from '@/lib/cronStatus';

/**
 * Avisos de sistema na Visão Geral — só aparecem quando há algo a fazer:
 * - a rotina diária de lembretes falhou ou pulou um dia;
 * - a própria conta está sem verificação em duas etapas.
 * Falha ao carregar não mostra nada: é um aviso, não pode atrapalhar a tela.
 */
export function SystemNotices() {
  const [cron, setCron] = useState<CronHealth | null>(null);
  const [semMfa, setSemMfa] = useState(false);

  useEffect(() => {
    apiFetch<{ cron: { health: CronHealth } }>('/api/admin/system-status')
      .then((r) => setCron(r.cron.health))
      .catch(() => {});
    apiFetch<{ enabled: boolean }>('/api/admin/account/mfa')
      .then((r) => setSemMfa(!r.enabled))
      .catch(() => {});
  }, []);

  const rotinaComProblema = cron === 'FALHOU' || cron === 'ATRASADA';
  if (!rotinaComProblema && !semMfa) return null;

  return (
    <div className="flex flex-col gap-2">
      {rotinaComProblema && (
        <p role="status" className="text-sm bg-spot-white text-spot-gray-900 border-l-[3px] border-spot-danger px-4 py-3">
          <strong>{cron === 'FALHOU' ? 'A rotina diária de lembretes falhou.' : 'A rotina diária de lembretes não roda há mais de um dia.'}</strong>{' '}
          Os gestores podem estar sem aviso de prazo.{' '}
          <Link href="/admin/settings#rotina" className="underline underline-offset-2">Ver detalhes</Link>
        </p>
      )}
      {semMfa && (
        <p role="status" className="text-sm bg-spot-white text-spot-gray-900 border-l-[3px] border-spot-warning px-4 py-3">
          <strong>Proteja a sua conta:</strong> ligue a verificação em duas etapas — com ela, quem descobrir a sua senha
          não entra sem o seu celular.{' '}
          <Link href="/admin/settings#duas-etapas" className="underline underline-offset-2">Ligar agora</Link>
        </p>
      )}
    </div>
  );
}
