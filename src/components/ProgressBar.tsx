export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-spot-gray-500 mb-1.5">
        <span>
          Página {current} de {total}
        </span>
        <span>{pct}% concluído</span>
      </div>
      <div className="h-2 w-full bg-spot-gray-200 overflow-hidden">
        <div
          className="h-full bg-spot-yellow transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
