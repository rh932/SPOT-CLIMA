import { getSurveyResults, getCommentAnalysis } from '@/lib/results';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/apiAuth';
import { hasPermission } from '@/lib/permissions';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

export default async function PrintReportPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Esta página lê o banco direto, sem passar por /api. O middleware só
  // confere a assinatura e o papel gravados no token; quem foi desativado ou
  // rebaixado depois do login precisa ser barrado aqui, relendo o banco.
  const allowed = await requireAdmin()
    .then((session) => hasPermission(session.role, 'reports.view'))
    .catch(() => false);
  if (!allowed) redirect('/admin/login');

  const results = await getSurveyResults(params.id);
  const comments = await getCommentAnalysis(params.id);
  if (!results || !comments) notFound();
  const actionPlans = await db.query.actionPlans.findMany({
    where: eq(schema.actionPlans.surveyId, params.id),
    orderBy: desc(schema.actionPlans.createdAt),
    with: { dimension: true, sector: true },
  });

  const today = new Date().toLocaleDateString('pt-BR');

  return (
    // data-tema="claro": é a prévia de uma folha impressa, então fica clara
    // mesmo com o aparelho no modo escuro — ver globals.css.
    <div data-tema="claro" className="max-w-3xl mx-auto bg-spot-white text-spot-gray-900 px-6 py-10 print:px-0 print:py-0 text-sm">
      <PrintButton />
      <header className="flex items-center justify-between border-b-4 border-spot-yellow pb-4 mb-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500">Relatório executivo</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Spot Integra</h1>
        </div>
        <div className="text-right text-xs text-spot-gray-500 tabular">
          <p>{results.surveyName}</p>
          <p>Gerado em {today}</p>
        </div>
      </header>

      {results.locked ? (
        <Section title="Resultados indisponíveis">
          <p>{results.lockedReason}</p>
          <KeyValue label="Respostas recebidas até agora" value={String(results.totalResponses)} />
        </Section>
      ) : (
      <>
      <Section title="1. Resumo Executivo">
        <p>
          A pesquisa &ldquo;{results.surveyName}&rdquo; obteve {results.totalResponses} respostas, com taxa de
          participação de {results.participationRate}% ({results.participationClassification}). O índice geral de
          clima organizacional foi de {results.climateIndex}%, classificado como &ldquo;{results.climateClassification.label}&rdquo;.
        </p>
      </Section>

      <Section title="2. Taxa de Participação">
        <KeyValue label="Respostas" value={String(results.totalResponses)} />
        <KeyValue label="População elegível" value={String(results.eligiblePopulation ?? '—')} />
        <KeyValue label="Taxa de participação" value={`${results.participationRate}% — ${results.participationClassification}`} />
      </Section>

      <Section title="3. Índice de Clima">
        <KeyValue label="Índice geral" value={`${results.climateIndex}% (${results.climateClassification.label})`} />
        <KeyValue label="Favorável / Neutro / Desfavorável" value={`${results.favorability.favorable}% / ${results.favorability.neutral}% / ${results.favorability.unfavorable}%`} />
      </Section>

      <Section title="4. Resultado por Dimensão">
        <Table
          head={['Dimensão', 'Média', 'Favorável', 'Neutro', 'Desfavorável', 'Status']}
          rows={results.byDimension.map((d) => [d.dimension, String(d.average), `${d.favorable}%`, `${d.neutral}%`, `${d.unfavorable}%`, d.classification.label])}
        />
      </Section>

      <Section title="5. Resultado por Setor">
        <Table
          head={['Setor', 'Respostas', 'Índice', 'Favorável']}
          rows={results.bySector.map((s) => [s.sector, s.responseCount === null ? '—' : String(s.responseCount), s.visible ? `${s.index}%` : 'Oculto (anonimato)', s.visible ? `${s.favorable}%` : '—'])}
        />
      </Section>

      <Section title="6. Mapa de Calor — Setor × Dimensão">
        <HeatmapTable cells={results.heatmap} />
      </Section>

      <Section title="7. Pontos Fortes (Top 10)">
        <ol className="list-decimal list-inside flex flex-col gap-1">
          {results.topStrengths.map((q) => (
            <li key={q.questionId}>{q.text} — <strong>{q.favorable}%</strong></li>
          ))}
        </ol>
      </Section>

      <Section title="8. Pontos Críticos (Top 10)">
        <ol className="list-decimal list-inside flex flex-col gap-1">
          {results.topCritical.map((q) => (
            <li key={q.questionId}>{q.text} — <strong>{q.favorable}%</strong></li>
          ))}
        </ol>
      </Section>

      <Section title="9. Comentários Agrupados por Tema">
        {comments.verbatimHidden ? (
          <p>Poucas pessoas comentaram — o conteúdo dos comentários fica oculto para preservar o anonimato.</p>
        ) : comments.byTheme.length === 0 ? (
          <p>Nenhum comentário registrado.</p>
        ) : (
          <Table head={['Tema', 'Quantidade']} rows={comments.byTheme.map((t) => [t.theme, String(t.count)])} />
        )}
      </Section>

      <Section title="10. Evolução Histórica">
        <p className="text-spot-gray-500">
          Consulte a tela de Comparativos no painel administrativo para a evolução entre múltiplas pesquisas — este
          relatório reflete apenas o ciclo &ldquo;{results.surveyName}&rdquo;.
        </p>
      </Section>

      <Section title="11. Recomendações">
        {results.recommendations.length === 0 ? (
          <p>Nenhuma dimensão abaixo do limite de atenção (65%).</p>
        ) : (
          results.recommendations.map((r) => (
            <div key={r.dimension} className="mb-3">
              <p className="font-semibold">{r.dimension} — {r.index}%</p>
              <ul className="list-disc list-inside">
                {r.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ))
        )}
      </Section>

      <Section title="12. Plano de Ação">
        {actionPlans.length === 0 ? (
          <p>Nenhum plano de ação registrado para esta pesquisa.</p>
        ) : (
          <Table
            head={['Problema', 'Prioridade', 'Responsável', 'Status', 'Prazo']}
            rows={actionPlans.map((p) => [
              p.problem, p.priority, p.owner, p.status, p.dueDate ? new Date(p.dueDate).toLocaleDateString('pt-BR') : '—',
            ])}
          />
        )}
      </Section>

      </>
      )}

      <footer className="text-[10px] text-spot-gray-500 mt-10 pt-4 border-t border-spot-gray-200">
        Documento gerado automaticamente pelo Spot Integra. Contém apenas dados agregados — nenhuma resposta individual
        é identificável.
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7 break-inside-avoid">
      <h2 className="font-display text-xl font-semibold text-spot-black border-b border-spot-gray-300 pb-2 mb-3 break-after-avoid">{title}</h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-spot-gray-500">{label}:</span> <strong>{value}</strong>
    </p>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="text-left border-b-2 border-spot-gray-800 py-1.5 pr-3">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-spot-gray-100">
            {row.map((cell, j) => (
              <td key={j} className="py-1.5 pr-3">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeatmapTable({ cells }: { cells: { sector: string; dimension: string; index: number | null; visible: boolean }[] }) {
  const sectors = Array.from(new Set(cells.map((c) => c.sector)));
  const dimensions = Array.from(new Set(cells.map((c) => c.dimension)));
  return (
    <table className="w-full border-collapse text-[10px]">
      <thead>
        <tr>
          <th className="text-left border-b-2 border-spot-gray-800 py-1 pr-2">Setor</th>
          {dimensions.map((d) => (
            <th key={d} className="text-center border-b-2 border-spot-gray-800 py-1 px-1">{d}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sectors.map((s) => (
          <tr key={s} className="border-b border-spot-gray-100">
            <td className="py-1 pr-2 font-medium whitespace-nowrap">{s}</td>
            {dimensions.map((d) => {
              const cell = cells.find((c) => c.sector === s && c.dimension === d);
              return (
                <td key={d} className="text-center py-1 px-1">
                  {cell?.visible ? `${cell.index}%` : '—'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
