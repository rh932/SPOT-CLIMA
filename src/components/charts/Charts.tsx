'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, Legend,
} from 'recharts';
import { useModoEscuro } from '@/components/theme/useModoEscuro';

// Faixas de favorabilidade (verde/amarelo/vermelho) são fixas de propósito —
// mesma classificação usada em src/lib/calculations.ts, e legíveis nos dois
// modos (são preenchimento, não texto).
const FAVORABLE = '#1F9D55';
const NEUTRAL = '#D9AE00';
const UNFAVORABLE = '#D64545';
const PRIMARY = '#F5C400';
const EXTRA_SERIES_COLORS = ['#3B82F6', '#D64545', '#8B5CF6'];

/*
 * O Recharts recebe cor como atributo do SVG, que não lê as variáveis do
 * globals.css — por isso o par claro/escuro é repetido aqui, com os mesmos
 * valores de lá. Sem isto, no modo escuro a série "tinta" (#0B0B0B) sumia no
 * fundo e os eixos saíam no #666 padrão da biblioteca (3:1 sobre o cartão).
 */
const PALETA = {
  claro: { tinta: '#0B0B0B', grade: '#E4E4E1', eixo: '#54544F', fundo: '#FFFFFF', texto: '#151512' },
  escuro: { tinta: '#F2EFE8', grade: '#2E2E2B', eixo: '#B3B1A9', fundo: '#1B1B19', texto: '#F2EFE8' },
};

function usePaleta() {
  const p = useModoEscuro() ? PALETA.escuro : PALETA.claro;
  return {
    ...p,
    tick: (fontSize: number) => ({ fontSize, fill: p.eixo }),
    tooltip: {
      contentStyle: { background: p.fundo, border: `1px solid ${p.grade}`, borderRadius: 10, color: p.texto, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.25)', fontSize: 13 },
      cursor: { fill: p.grade, fillOpacity: 0.45 },
      labelStyle: { color: p.texto },
      itemStyle: { color: p.texto },
    },
    legenda: (valor: string) => <span style={{ color: p.eixo }}>{valor}</span>,
  };
}

export function IndexBarChart({ data, dataKey = 'index', nameKey = 'name' }: { data: Record<string, unknown>[]; dataKey?: string; nameKey?: string }) {
  const p = usePaleta();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke={p.grade} />
        <XAxis type="number" domain={[0, 100]} tick={p.tick(12)} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey={nameKey} width={150} tick={p.tick(12)} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => `${v}%`} {...p.tooltip} />
        <Bar dataKey={dataKey} fill={p.tinta} radius={[0, 8, 8, 0]} barSize={18}>
          {data.map((_, i) => (
            <Cell key={i} fill={(data[i][dataKey] as number) >= 75 ? FAVORABLE : (data[i][dataKey] as number) >= 65 ? NEUTRAL : UNFAVORABLE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FavorabilityDonut({ favorable, neutral, unfavorable }: { favorable: number; neutral: number; unfavorable: number }) {
  const p = usePaleta();
  const data = [
    { name: 'Favorável', value: favorable, color: FAVORABLE },
    { name: 'Neutro', value: neutral, color: NEUTRAL },
    { name: 'Desfavorável', value: unfavorable, color: UNFAVORABLE },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={3} cornerRadius={4} stroke="none">
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => `${v}%`} {...p.tooltip} />
        <Legend verticalAlign="bottom" height={30} formatter={p.legenda} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ResponseDistributionPie({ data }: { data: { name: string; value: number }[] }) {
  const p = usePaleta();
  const seriesColors = [PRIMARY, p.tinta, ...EXTRA_SERIES_COLORS];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={95} label={(e) => `${e.name}: ${e.value}`}>
          {data.map((_, i) => (
            <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
          ))}
        </Pie>
        <Tooltip {...p.tooltip} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DimensionRadar({ data }: { data: { dimension: string; index: number }[] }) {
  const p = usePaleta();
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke={p.grade} />
        <PolarAngleAxis dataKey="dimension" tick={p.tick(11)} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={p.tick(10)} />
        <Radar name="Índice" dataKey="index" stroke={p.tinta} fill={PRIMARY} fillOpacity={0.55} />
        <Tooltip formatter={(v: number) => `${v}%`} {...p.tooltip} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function EvolutionLineChart({
  data,
  lines,
}: {
  data: Record<string, unknown>[];
  lines: { key: string; label: string }[];
}) {
  const p = usePaleta();
  const seriesColors = [PRIMARY, p.tinta, ...EXTRA_SERIES_COLORS];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={p.grade} />
        <XAxis dataKey="surveyName" tick={p.tick(11)} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={p.tick(12)} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => `${v}%`} {...p.tooltip} />
        <Legend formatter={p.legenda} />
        {lines.map((l, i) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={seriesColors[i % seriesColors.length]} strokeWidth={2.5} dot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
