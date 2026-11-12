'use client';

import { useEffect, useState } from 'react';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Permissões da sessão atual, vindas do servidor.
 *
 * Servem só para montar a interface — o bloqueio real está em
 * `requirePermission()` em cada rota. Se alguém forjar isto no navegador, a
 * única coisa que consegue é ver um menu que não funciona.
 *
 * Qualquer desfecho tira o hook de "carregando", inclusive falha de rede: antes
 * um erro deixava `permissions` em null para sempre e o menu ficava vazio sem
 * explicação — o que acontecia no celular quando a sessão de 8h expirava ou a
 * conexão caía no meio do carregamento.
 */
export function useMyPermissions() {
  const [permissions, setPermissions] = useState<PermissionKey[] | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/gestor/me')
      .then(async (r) => {
        if (!active) return;
        if (r.status === 401 || r.status === 403) {
          setExpired(true);
          setPermissions([]);
          return;
        }
        if (!r.ok) {
          setFailed(true);
          setPermissions([]);
          return;
        }
        const d = await r.json();
        setPermissions(d.permissions ?? []);
        setRole(d.role ?? null);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setPermissions([]);
      });
    return () => { active = false; };
  }, []);

  const can = (key: PermissionKey) => Boolean(permissions?.includes(key));
  return { permissions, role, can, loading: permissions === null, expired, failed };
}
