'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, Legend,
} from 'recharts';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useModoEscuro } from '@/components/theme/useModoEscuro';

// Faixas de favorabilidade (verde/amarelo/vermelho) são fixas de propósito —
// mesma classificação usada em src/lib/calculations.ts, e legíveis nos dois
// modos (são preenchimento, não texto).
const FAVORABLE = '#2F7A4D';
const NEUTRAL = '#E3B300';
const UNFAVORABLE = '#D9442A';
const PRIMARY = '#F5C400';
const EXTRA_SERIES_COLORS = ['#3B82F6', '#D64545', '#8B5CF6'];

/*
 * O Recharts recebe cor como atributo do SVG, que não lê as variáveis do
 * globals.css — por isso o par claro/escuro é repetido aqui, com os mesmos
 * valores de lá. Sem isto, no modo escuro a série "tinta" (#0B0B0B) sumia no
 * fundo e os eixos saíam no #666 padrão da biblioteca (3:1 sobre o cartão).
 */
const PALETA = {
  claro: { tinta: '#16130F', grade: '#D6CDBC', eixo: '#504A3E', fundo: '#FBF8F1', texto: '#16130F' },
  escuro: { tinta: '#EEE8DC', grade: '#363229', eixo: '#BAB2A2', fundo: '#201D19', texto: '#EEE8DC' },
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

/*
 * Tempo dos gráficos que se desenham na entrada. O padrão do Recharts (1,5 s
 * com `ease` no donut) se arrastava depois que o resto da tela já tinha
 * chegado; aqui as barras crescem e o anel fecha logo depois que o cartão
 * assenta (ver Cascata), com saída suave. Com "reduzir movimento" ligado o
 * gráfico já nasce pronto — o Recharts não lê essa preferência sozinho.
 */
const DESENHO = { animationDuration: 700, animationEasing: 'ease-out' } as const;

/** Quantos segmentos tem o medidor: cada um vale 5 pontos de 0 a 100. */
const SEGMENTOS = 20;

/**
 * Índice por dimensão como MEDIDOR EM LED ("Placa de serviço"): cada linha é
 * uma régua de 20 segmentos que acendem até o valor, na cor da faixa
 * (favorável/neutro/desfavorável), com o número em mono ao lado. Lê-se de
 * relance como o painel de um aparelho, e o nome e o número continuam em
 * texto — a cor reforça, não carrega o sentido sozinha.
 *
 * Os segmentos acendem em sequência quando o bloco aparece; com "reduzir
 * movimento" já nascem acesos.
 */
export function IndexBarChart({ data, dataKey = 'index', nameKey = 'name' }: { data: Record<string, unknown>[]; dataKey?: string; nameKey?: string }) {
  const p = usePaleta();
  const reduzido = useReducedMotion();
  const [aceso, setAceso] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setAceso(true), 150);
    return () => window.clearTimeout(t);
  }, []);
  const ligado = aceso || !!reduzido;

  return (
    <ul className="flex flex-col gap-3 py-1">
      {data.map((d, linha) => {
        const nome = String(d[nameKey]);
        const valor = Number(d[dataKey]) || 0;
        const cor = valor >= 75 ? FAVORABLE : valor >= 65 ? NEUTRAL : UNFAVORABLE;
        const acesos = Math.round(Math.min(100, Math.max(0, valor)) / (100 / SEGMENTOS));
        return (
          <li key={nome} className="grid grid-cols-[minmax(0,8.5rem)_1fr_3rem] sm:grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-3 text-sm">
            <span className="truncate" title={nome}>{nome}</span>
            <span aria-hidden className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[2px]">
              {Array.from({ length: SEGMENTOS }, (_, i) => (
                <i
                  key={i}
                  className="block h-3.5 rounded-[1px]"
                  style={{
                    background: ligado && i < acesos ? cor : p.grade,
                    transition: reduzido ? undefined : `background-color 90ms ${linha * 60 + i * 22}ms`,
                  }}
                />
              ))}
            </span>
            <span className="font-mono text-sm font-medium text-right tabular">{valor}%</span>
          </li>
        );
      })}
    </ul>
  );
}

export function FavorabilityDonut({ favorable, neutral, unfavorable }: { favorable: number; neutral: number; unfavorable: number }) {
  const p = usePaleta();
  const data = [
    { name: 'Favorável', value: favorable, color: FAVORABLE },
    { name: 'Neutro', value: neutral, color: NEUTRAL },
    { name: 'Desfavorável', value: unfavorable, color: UNFAVORABLE },
  ];
  const reduzido = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={3} cornerRadius={4} stroke="none" isAnimationActive={!reduzido} animationBegin={350} {...DESENHO} animationDuration={850}>
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
