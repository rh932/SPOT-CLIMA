import { PILARES_ROTEIRO, COMPETENCIAS_ROTEIRO, PLANO_70_20_10, notaDoPilar, type RoteiroGravado } from '@/data/roteiroPdi';
import { StarRating } from '@/components/StarRating';

/** Roteiro PDI preenchido (Paulista e JK): nota de cada item, plano 70/20/10 e competências. */
export function RoteiroResumo({ roteiro }: { roteiro: RoteiroGravado }) {
  const competencias = COMPETENCIAS_ROTEIRO.filter((c) => roteiro.plano?.competencias?.includes(c.key));
  const rotulo = 'font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1';
  return (
    <div className="flex flex-col gap-4">
      {PILARES_ROTEIRO.map((p) => (
        <div key={p.key} className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="font-semibold text-sm">{p.nome}</p>
            <StarRating rating={notaDoPilar(roteiro.notas, p)!} showLabel />
          </div>
          {p.grupos.map((g, i) => (
            <div key={i}>
              {g.nome && <p className="text-xs font-semibold text-spot-gray-500 mb-1">{g.nome}</p>}
              <ul className="flex flex-col gap-1.5">
                {g.itens.map((it) => (
                  <li key={it.key} className="flex items-start justify-between gap-3 text-sm border-b border-spot-gray-100 pb-1.5">
                    <span className="text-spot-gray-600">{it.text}</span>
                    <span className="shrink-0">{roteiro.notas?.[it.key] ? <StarRating rating={roteiro.notas[it.key]} showLabel /> : 'Sem nota'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {roteiro.observacoes?.[p.key] && <p className="text-sm"><span className="text-spot-gray-500">Observação: </span>{roteiro.observacoes[p.key]}</p>}
        </div>
      ))}

      <div className="flex flex-col gap-2 border-t border-spot-gray-100 pt-3">
        <p className="font-semibold text-sm">Plano de desenvolvimento (70/20/10)</p>
        {competencias.length > 0 && (
          <div className="text-sm">
            <p className={rotulo}>Competências a desenvolver</p>
            <p>{competencias.map((c) => c.text).join(' · ')}</p>
          </div>
        )}
        {PLANO_70_20_10.map((parte) => {
          const texto = roteiro.plano?.[parte.key];
          return texto ? (
            <div key={parte.key} className="text-sm">
              <p className={rotulo}>{parte.titulo}</p>
              <p className="whitespace-pre-line">{texto}</p>
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}
