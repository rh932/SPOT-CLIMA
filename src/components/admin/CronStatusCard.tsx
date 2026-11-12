'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ErrorState, SkeletonText } from '@/components/async';
import type { CronHealth, CronRun } from '@/lib/cronStatus';

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const TEXTO: Record<CronHealth, { titulo: string; cor: string }> = {
  OK: { titulo: 'Funcionando', cor: '#0f7a3d' },
  FALHOU: { titulo: 'Falhou na última execução', cor: '#d64545' },
  ATRASADA: { titulo: 'Não roda há mais de um dia', cor: '#e27a2e' },
  NUNCA_RODOU: { titulo: 'Ainda sem registro', cor: '#8a8478' },
};

/**
 * "Rotina diária de avisos" em Configurações: a última execução do cron e o
 * que ela fez. Falha ou dia pulado aparecem aqui (e no sino do Super Admin).
 */
export function CronStatusCard() {
  const [data, setData] = useState<{ run: CronRun | null; health: CronHealth } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setErro(null);
    apiFetch<{ cron: { run: CronRun | null; health: CronHealth } }>('/api/admin/system-status')
      .then((r) => setData(r.cron))
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="card flex flex-col gap-3" id="rotina">
      <div>
        <p className="font-semibold">Rotina diária de avisos</p>
        <p className="text-sm text-spot-gray-500">
          Todo dia às 11h (Brasília) o sistema manda os lembretes de avaliação e feedback aos gestores.
        </p>
      </div>
      {erro ? (
        <ErrorState message={erro} onRetry={carregar} />
      ) : !data ? (
        <SkeletonText lines={2} />
      ) : (
        <>
          <p className="text-sm inline-flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: TEXTO[data.health].cor }} />
            <strong>{TEXTO[data.health].titulo}</strong>
          </p>
          {data.run && (
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-spot-gray-500">Última execução</dt>
              <dd>{quando(data.run.at)}</dd>
              {data.run.ok ? (
                <>
                  <dt className="text-spot-gray-500">Resultado</dt>
                  <dd>{data.run.avisos ?? 0} aviso(s) enviado(s) · {data.run.naJanela ?? 0} prazo(s) no dia de aviso</dd>
                </>
              ) : (
                <>
                  <dt className="text-spot-gray-500">Erro</dt>
                  <dd className="text-spot-danger break-words">{data.run.erro ?? 'Sem detalhe.'}</dd>
                  <dt className="text-spot-gray-500">Último sucesso</dt>
                  <dd>{data.run.lastOkAt ? quando(data.run.lastOkAt) : '—'}</dd>
                </>
              )}
            </dl>
          )}
          {data.health !== 'OK' && (
            <p className="text-xs text-spot-gray-600">
              Enquanto isso, o botão &quot;Lembrar gestores agora&quot; (Avaliação de Experiência) manda os lembretes na hora.
              {data.health !== 'NUNCA_RODOU' && ' Se continuar, confira o cron e o CRON_SECRET no painel da Vercel.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
