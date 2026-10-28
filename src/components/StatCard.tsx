import { Icone, type NomeIcone } from '@/components/ui/Icone';
import { NumeroRolante } from '@/components/ui/NumeroRolante';

/**
 * Indicador da régua (ver ReguaIndicadores em src/components/ui/Secao): rótulo
 * em mono, valor grande em mono tabular e a variação logo abaixo.
 *
 * `destaque` põe a marca amarela antes do rótulo — use em um só indicador por
 * tela, o que o RH precisa ver primeiro.
 *
 * `icone` é aceito e ignorado: o ícone no quadradinho era sinal de template e
 * saiu na linguagem "Comanda". Fica na assinatura para não quebrar quem passa.
 */
export function StatCard({
  label,
  value,
  sub,
  trend,
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
      <p className="stat-rotulo">{label}</p>
      <p className="stat-valor"><NumeroRolante valor={value} /></p>
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
