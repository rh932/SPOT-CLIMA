import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/*
 * Tipografia do sistema — linguagem "Placa de serviço", ver
 * design-system/spot-clima/MASTER.md.
 *
 * Três famílias, cada uma com um papel:
 *   sans (Bricolage Grotesque) — corpo E títulos. Grotesca de eixo óptico:
 *     em 800 e grande ela vira a "placa" (o número que é o título da tela);
 *     em 400 pequena, lê bem em tabela e formulário.
 *   display (Instrument Serif, itálico) — a voz do sistema falando com a
 *     pessoa: subtítulo, pergunta da pesquisa, o que pede atenção. Nunca em
 *     dado nem em botão.
 *   mono (DM Mono) — rótulo micro em caixa-alta, prazo, número tabular.
 *
 * `capa` (IBM Plex Sans) só existe para as capas de entrada (login e capa da
 * pesquisa), que ficaram fora do redesenho por decisão do usuário.
 *
 * As fontes ficam em src/fonts e entram por `next/font/local`: sem request
 * para o Google em runtime (importa num PWA que roda no wifi do salão), sem o
 * pulo de layout do FOUT e sem depender do Google no build. O `next/font/google`
 * quebrou o deploy na Vercel em 26/11/2026 (URL da fonte sem extensão).
 */
const sans = localFont({
  src: '../fonts/bricolage-grotesque-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-sans',
  display: 'swap',
});

const display = localFont({
  src: [
    { path: '../fonts/instrument-serif-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-serif-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: '../fonts/dm-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/dm-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
});

const capa = localFont({
  src: [
    { path: '../fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-capa',
  display: 'swap',
});

/*
 * Padrão visual Spot Integra (área dos gestores; depois admin e pesquisa).
 * Plus Jakarta Sans é display e texto; Newsreader itálica é o acento pessoal
 * ("Boa noite,"). O mono do padrão é a DM Mono que já está acima. As
 * variáveis ligam em --font-* só dentro de .sp (src/styles/spot-tokens.css).
 */
const jakarta = localFont({
  src: [
    { path: '../fonts/plus-jakarta-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/plus-jakarta-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/plus-jakarta-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/plus-jakarta-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../fonts/plus-jakarta-sans-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--sp-jakarta',
  display: 'swap',
});

const newsreader = localFont({
  src: [
    { path: '../fonts/newsreader-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../fonts/newsreader-latin-500-italic.woff2', weight: '500', style: 'italic' },
  ],
  variable: '--sp-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Spot Integra — Pesquisa de Clima Organizacional',
  description: 'Sistema de Pesquisa de Clima Organizacional do Restaurante Spot',
  robots: { index: false, follow: false },
  // O manifesto é o que permite instalar o sistema na tela de início. No
  // iPhone isso não é enfeite: o Safari só entrega aviso por push para um app
  // instalado — no navegador comum, a permissão nem é oferecida.
  manifest: '/manifest.webmanifest',
  applicationName: 'Spot Integra',
  appleWebApp: {
    capable: true,
    title: 'Spot Integra',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    // Definir `icons` aqui substitui o favicon automático que o Next geraria
    // a partir de src/app/icon.png — sem a chave `icon`, nenhuma <link
    // rel="icon"> é emitida e o ícone aparece quebrado em abas/atalhos.
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#16130F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable} ${capa.variable} ${jakarta.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
