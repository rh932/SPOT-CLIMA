import ExcelJS from 'exceljs';
import type { SurveyResultsSummary, CommentAnalysis } from './results';

export function buildCsv(results: SurveyResultsSummary): string {
  const lines: string[] = [];
  // Prefixo ' impede que Excel/Sheets interpretem o valor como fórmula (CSV injection).
  const esc = (v: string | number) => {
    const s = String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  lines.push('SPOT CLIMA - Relatório Consolidado (dados agregados, sem identificação individual)');
  lines.push(`Pesquisa,${esc(results.surveyName)}`);
  lines.push(`Total de respostas,${results.totalResponses}`);
  lines.push(`Taxa de participação,${results.participationRate}%`);
  lines.push(`Índice de clima,${results.climateIndex}%`);
  lines.push('');
  lines.push('Dimensão,Média,Favorável (%),Neutro (%),Desfavorável (%),Status');
  for (const d of results.byDimension) {
    lines.push([esc(d.dimension), d.average, d.favorable, d.neutral, d.unfavorable, esc(d.classification.label)].join(','));
  }
  lines.push('');
  lines.push('Setor,Respostas,Índice,Favorável (%),Status');
  for (const s of results.bySector) {
    lines.push(
      [
        esc(s.sector),
        s.responseCount ?? '-',
        s.visible ? s.index : 'Oculto (anonimato)',
        s.visible ? s.favorable : '-',
        s.visible ? 'Visível' : 'Oculto',
      ].join(',')
    );
  }
  lines.push('');
  lines.push('Unidade,Respostas,Índice,Favorável (%),Status');
  for (const u of results.byUnit) {
    lines.push(
      [
        esc(u.unit),
        u.responseCount ?? '-',
        u.visible ? u.index : 'Oculto (anonimato)',
        u.visible ? u.favorable : '-',
        u.visible ? 'Visível' : 'Oculto',
      ].join(',')
    );
  }
  return lines.join('\n');
}

export async function buildXlsx(results: SurveyResultsSummary, comments: CommentAnalysis): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SPOT CLIMA';
  workbook.created = new Date();

  const resumo = workbook.addWorksheet('Resumo Executivo');
  resumo.columns = [{ width: 32 }, { width: 24 }];
  resumo.addRows([
    ['Pesquisa', results.surveyName],
    ['Total de respostas', results.totalResponses],
    ['População elegível', results.eligiblePopulation ?? '-'],
    ['Taxa de participação', `${results.participationRate}%`],
    ['Classificação de participação', results.participationClassification],
    ['Índice de clima', `${results.climateIndex}%`],
    ['Classificação do clima', results.climateClassification.label],
    ['Favorável (%)', results.favorability.favorable],
    ['Neutro (%)', results.favorability.neutral],
    ['Desfavorável (%)', results.favorability.unfavorable],
    ['Desvio padrão', results.standardDeviation],
  ]);
  resumo.getColumn(1).font = { bold: true };

  const byDimension = workbook.addWorksheet('Por Dimensão');
  byDimension.columns = [
    { header: 'Dimensão', key: 'dimension', width: 30 },
    { header: 'Média', key: 'average', width: 10 },
    { header: 'Índice (%)', key: 'index', width: 12 },
    { header: 'Favorável (%)', key: 'favorable', width: 14 },
    { header: 'Neutro (%)', key: 'neutral', width: 12 },
    { header: 'Desfavorável (%)', key: 'unfavorable', width: 16 },
    { header: 'Status', key: 'status', width: 16 },
  ];
  byDimension.getRow(1).font = { bold: true };
  for (const d of results.byDimension) {
    byDimension.addRow({
      dimension: d.dimension, average: d.average, index: d.index, favorable: d.favorable,
      neutral: d.neutral, unfavorable: d.unfavorable, status: d.classification.label,
    });
  }

  const bySector = workbook.addWorksheet('Por Setor');
  bySector.columns = [
    { header: 'Setor', key: 'sector', width: 24 },
    { header: 'Respostas', key: 'count', width: 12 },
    { header: 'Índice (%)', key: 'index', width: 12 },
    { header: 'Favorável (%)', key: 'favorable', width: 14 },
    { header: 'Status', key: 'status', width: 30 },
  ];
  bySector.getRow(1).font = { bold: true };
  for (const s of results.bySector) {
    bySector.addRow({
      sector: s.sector,
      count: s.responseCount ?? '-',
      index: s.visible ? s.index : '-',
      favorable: s.visible ? s.favorable : '-',
      status: s.visible ? 'Visível' : 'Oculto para preservar anonimato (mínimo de respostas não atingido)',
    });
  }

  const byUnit = workbook.addWorksheet('Por Unidade');
  byUnit.columns = [
    { header: 'Unidade', key: 'unit', width: 24 },
    { header: 'Respostas', key: 'count', width: 12 },
    { header: 'Índice (%)', key: 'index', width: 12 },
    { header: 'Favorável (%)', key: 'favorable', width: 14 },
    { header: 'Status', key: 'status', width: 30 },
  ];
  byUnit.getRow(1).font = { bold: true };
  for (const u of results.byUnit) {
    byUnit.addRow({
      unit: u.unit,
      count: u.responseCount ?? '-',
      index: u.visible ? u.index : '-',
      favorable: u.visible ? u.favorable : '-',
      status: u.visible ? 'Visível' : 'Oculto para preservar anonimato (mínimo de respostas não atingido)',
    });
  }

  const strengths = workbook.addWorksheet('Pontos Fortes e Críticos');
  strengths.columns = [
    { header: 'Top 10 Pontos Fortes', key: 'strength', width: 60 },
    { header: 'Favorável (%)', key: 'sFav', width: 14 },
    { header: 'Top 10 Pontos Críticos', key: 'critical', width: 60 },
    { header: 'Favorável (%)', key: 'cFav', width: 14 },
  ];
  strengths.getRow(1).font = { bold: true };
  const maxRows = Math.max(results.topStrengths.length, results.topCritical.length);
  for (let i = 0; i < maxRows; i++) {
    strengths.addRow({
      strength: results.topStrengths[i]?.text ?? '',
      sFav: results.topStrengths[i]?.favorable ?? '',
      critical: results.topCritical[i]?.text ?? '',
      cFav: results.topCritical[i]?.favorable ?? '',
    });
  }

  const commentsSheet = workbook.addWorksheet('Comentários por Tema');
  commentsSheet.columns = [
    { header: 'Tema', key: 'theme', width: 24 },
    { header: 'Quantidade', key: 'count', width: 14 },
  ];
  commentsSheet.getRow(1).font = { bold: true };
  for (const t of comments.byTheme) commentsSheet.addRow(t);

  const recSheet = workbook.addWorksheet('Recomendações');
  recSheet.columns = [
    { header: 'Dimensão', key: 'dimension', width: 24 },
    { header: 'Índice (%)', key: 'index', width: 12 },
    { header: 'Sugestão', key: 'suggestion', width: 70 },
  ];
  recSheet.getRow(1).font = { bold: true };
  for (const r of results.recommendations) {
    for (const s of r.suggestions) {
      recSheet.addRow({ dimension: r.dimension, index: r.index, suggestion: s });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
