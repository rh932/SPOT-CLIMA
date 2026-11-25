'use client';

import { useState } from 'react';

/**
 * Foto do colaborador por cima das iniciais. Sem foto (404) ou imagem que não
 * carrega, a foto some e ficam as iniciais — o avatar nunca aparece quebrado.
 *
 * `portal` escolhe a rota: o gestor só recebe a foto de quem está no escopo
 * dele; o admin (RH/Super Admin) recebe a de qualquer um. A imagem é decorativa
 * (alt vazio): o nome já está escrito ao lado.
 */
export function FotoColaborador({ employeeId, portal }: { employeeId: string; portal: 'gestor' | 'admin' }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/${portal}/employees/${employeeId}/photo`}
      alt=""
      loading="lazy"
      decoding="async"
      className="foto-av"
      onError={() => setFalhou(true)}
    />
  );
}
