import { Icone, type NomeIcone } from '@/components/ui/Icone';

/**
 * Indicador da grade (ver ReguaIndicadores em src/components/ui/Secao): cartão
 * com rótulo, ícone opcional, valor grande em serifa e a variação logo abaixo.
 *
 * `destaque` pinta o cartão na superfície escura da barra lateral — use em um
 * só indicador por tela, o que o RH precisa ver primeiro.
 *
 * Quem o usa está em quase toda tela do admin e do gestor; por isso o nome e
 * os parâmetros antigos continuam valendo e `icone`/`destaque` são opcionais.
 */
export function StatCard({
  label,
  value,
  sub,
  trend,
  icone,
  destaque,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: { direction: 'up' | 'down' | 'stable'; text: string };
  icone?: NomeIcone;
  destaque?: boolean;
}) {
  return (
    <div className={`stat ${destaque ? 'stat-destaque' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="stat-rotulo pt-0.5">{label}</p>
        {icone && (
          <span className="stat-icone">
            <Icone nome={icone} />
          </span>
        )}
      </div>
      <p className="stat-valor">{value}</p>
      {sub && <p className="stat-apoio">{sub}</p>}
      {trend && (
        <p
          className={`inline-flex items-center gap-1 text-xs font-medium mt-2 ${
            trend.direction === 'up'
              ? 'text-spot-success'
              : trend.direction === 'down'
                ? 'text-spot-danger'
                : 'text-spot-gray-500'
          }`}
        >
          <Icone nome={trend.direction === 'up' ? 'alta' : trend.direction === 'down' ? 'baixa' : 'estavel'} className="h-3.5 w-3.5" />
          {trend.text}
        </p>
      )}
    </div>
  );
}

const CLASSIFICATION_BADGE: Record<string, string> = {
  excellent: 'badge-excellent',
  good: 'badge-good',
  attention: 'badge-attention',
  critical: 'badge-critical',
  'very-critical': 'badge-very-critical',
};

export function ClassificationBadge({ label, colorToken }: { label: string; colorToken: string }) {
  return <span className={`badge ${CLASSIFICATION_BADGE[colorToken] ?? 'badge-attention'}`}>{label}</span>;
}
