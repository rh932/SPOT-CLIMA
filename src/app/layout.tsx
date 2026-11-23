import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, DM_Mono, IBM_Plex_Sans, Instrument_Serif, Newsreader, Plus_Jakarta_Sans } from 'next/font/google';
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
 * `next/font` baixa e hospeda as fontes junto do app: sem request para o
 * Google em runtime (importa num PWA que roda no wifi do salão) e sem o pulo
 * de layout do FOUT.
 */
const sans = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const mono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const capa = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-capa',
  display: 'swap',
});

/*
 * Padrão visual Spot Integra (área dos gestores; depois admin e pesquisa).
 * Plus Jakarta Sans é display e texto; Newsreader itálica é o acento pessoal
 * ("Boa noite,"). O mono do padrão é a DM Mono que já está acima. As
 * variáveis ligam em --font-* só dentro de .sp (src/styles/spot-tokens.css).
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--sp-jakarta',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: 'italic',
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
