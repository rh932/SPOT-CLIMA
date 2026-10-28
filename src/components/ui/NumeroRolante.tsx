'use client';

import { useEffect, useState } from 'react';
import NumberFlow from '@number-flow/react';

/**
 * Valor de indicador que rola dígito a dígito: conta a partir de 0 quando
 * aparece e, quando o valor muda (trocar a pesquisa em foco, por exemplo), os
 * dígitos giram do número antigo para o novo em vez de trocar de uma vez.
 *
 * Recebe o texto já formatado que as telas montam (`"72%"`, `"12"`, `"4,5"`).
 * Só número com `%` opcional rola; o resto (`"—"`, `"3 / 10"`, datas) sai como
 * texto, sem animação — inventar dígito para o que não é número confunde.
 *
 * `prefers-reduced-motion` é respeitado pela própria NumberFlow: o valor troca
 * sem girar.
 */
const NUMERO = /^(-?\d+)(?:([.,])(\d+))?(\s?%)?$/;

export function NumeroRolante({ valor }: { valor: string }) {
  const m = NUMERO.exec(valor.trim());
  const alvo = m ? Number(`${m[1]}.${m[3] ?? '0'}`) : 0;
  // Começa em 0 e vai ao valor depois de montar: é isso que faz o número
  // "contar" na entrada da tela, e não só nas trocas.
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => { setMostrado(alvo); }, [alvo]);

  if (!m) return <>{valor}</>;

  const casas = m[3]?.length ?? 0;
  return (
    <NumberFlow
      value={mostrado}
      // O separador decimal segue o do texto recebido: a tela que já escrevia
      // "4,5" continua com vírgula, e a que escrevia "4.5" com ponto.
      locales={m[2] === '.' ? 'en-US' : 'pt-BR'}
      format={{ minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false }}
      suffix={m[4] ?? ''}
      transformTiming={{ duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      spinTiming={{ duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
    />
  );
}
