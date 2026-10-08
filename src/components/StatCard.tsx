/**
 * Indicador da régua (ver ReguaIndicadores em src/components/ui/Secao).
 *
 * Era um card branco com sombra e animação de entrada. Virou número: rótulo
 * micro em monoespaçada, valor grande em serifa e a variação numa linha
 * discreta. O nome do componente ficou por compatibilidade — quem o usa está
 * em quase toda tela do admin e do gestor.
 *
 * A animação de entrada saiu de propósito: quatro números subindo em sequência
 * a cada carregamento é enfeite que atrasa a leitura de quem só quer conferir
 * o índice do dia.
 */
export function StatCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: { direction: 'up' | 'down' | 'stable'; text: string };
}) {
  return (
    <div className="stat">
      <p className="stat-rotulo">{label}</p>
      <p className="stat-valor">{value}</p>
      {sub && <p className="stat-apoio">{sub}</p>}
      {trend && (
        <p
          className={`text-xs font-medium mt-1.5 ${
            trend.direction === 'up'
              ? 'text-spot-success'
              : trend.direction === 'down'
                ? 'text-spot-danger'
                : 'text-spot-gray-500'
          }`}
        >
          {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.text}
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
