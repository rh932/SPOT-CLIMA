'use client';

import { FotoColaborador } from '@/components/ui/FotoColaborador';
import { useEffect, useRef } from 'react';
import { Ic } from '@/components/sp/Ic';
import { burst, center, sound } from '@/lib/motion';
import { evaluationOpen, useGestorEmployees } from '@/app/gestor/useGestorEmployees';
import { iniciaisDe, etapaLabel, tomDoPrazo } from '@/app/gestor/EmployeeCard';
import { prazoBadge } from '@/app/gestor/useGestorEmployees';

/**
 * "Avaliação enviada": painel âmbar com selo e confete, e a próxima pessoa da
 * fila. Só aparece depois que o servidor confirmou o registro.
 */
export function AvaliacaoEnviada({
  id, nome, periodoLabel, resultado, onVoltar, onProxima,
}: {
  id: string;
  nome: string;
  periodoLabel: string;
  resultado: string;
  onVoltar: () => void;
  onProxima: (id: string) => void;
}) {
  const selo = useRef<HTMLSpanElement>(null);
  const { employees, loading } = useGestorEmployees();

  useEffect(() => {
    const t = setTimeout(() => {
      if (selo.current) {
        const c = center(selo.current);
        burst(c.x, c.y, 70);
      }
      sound('end');
    }, 250);
    return () => clearTimeout(t);
  }, []);

  // A fila: quem ainda está com a avaliação aberta, menos a pessoa que acabou de ser avaliada.
  const fila = employees.filter((e) => e.id !== id && evaluationOpen(e));
  const proxima = fila[0];

  return (
    <div className="flow-ov" role="region" aria-label="Avaliação enviada">
      <div className="done">
        <section className="done-hero">
          <span className="seal" ref={selo}>
            <svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="var(--c-accent)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h1 className="H" role="status">Avaliação enviada</h1>
          <p>{nome} · {periodoLabel}{resultado ? <> · <b>{resultado}</b></> : null}</p>
        </section>
        <div className="done-body">
          <h2 className="H desk" style={{ fontSize: 40, marginBottom: 8 }}>Mais uma <span className="hl">concluída</span>.</h2>
          {!loading && fila.length > 0 && (
            <section className="card done-more">
              <div className="rowhead"><b>Próximos da fila</b><span className="kick">{fila.length} {fila.length === 1 ? 'pessoa' : 'pessoas'}</span></div>
              <div className="mini-list">
                {fila.slice(0, 3).map((e) => {
                  const b = prazoBadge(e);
                  const tom = tomDoPrazo(b?.className);
                  return (
                    <button key={e.id} type="button" className="it" onClick={() => onProxima(e.id)}>
                      <span className="av" style={{ width: 38, height: 38, borderRadius: 12, fontSize: 13 }}>{iniciaisDe(e.fullName)}<FotoColaborador employeeId={e.id} portal="gestor" /></span>
                      <span><b style={{ fontSize: 15 }}>{e.fullName}</b><small>{etapaLabel(e)}</small></span>
                      {b && <span className={`tag ${tom === 'atrasado' ? 't-late' : tom === 'perto' ? 't-week' : 't-soft'}`}>{b.label}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {proxima && (
            <button type="button" className="nextq" style={{ marginTop: 'auto' }} onClick={() => onProxima(proxima.id)}>
              <span className="t">
                <small>PRÓXIMA DA FILA</small>
                <b>Avaliar {proxima.fullName}</b>
                <em>{prazoBadge(proxima)?.label}</em>
              </span>
              <span className="go"><Ic n="arrow" s={20} w={2.2} /></span>
            </button>
          )}
          <button type="button" className="btn btn-block" style={{ background: 'none', fontWeight: 600 }} onClick={onVoltar}>Voltar para o início</button>
        </div>
      </div>
    </div>
  );
}
