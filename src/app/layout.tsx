import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

/*
 * Tipografia do sistema — ver design-system/spot-clima/MASTER.md, seção 4.
 *
 * Até aqui o Tailwind declarava `Inter` mas NINGUÉM carregava a fonte: o app
 * inteiro renderizava no system-ui de cada aparelho (San Francisco no iPhone,
 * Segoe no Windows, Roboto no Android). Ou seja, a mesma tela tinha três caras
 * diferentes e nenhuma delas era uma escolha.
 *
 * As três famílias têm papéis separados e não se misturam:
 *   display (Fraunces) — títulos e NÚMEROS. Serifa de eixo variável, com
 *     desenho claramente autoral; é o que tira o painel da cara de template.
 *     Só de 20px para cima, onde o desenho aparece e a leitura não sofre.
 *   sans (IBM Plex Sans) — corpo, formulário, tabela. Humanista e feita para
 *     tela densa; diferente do Inter/Roboto que todo painel usa.
 *   mono (IBM Plex Mono) — rótulo micro em caixa-alta e número tabular. É o
 *     que dá o ar de boletim interno em vez de dashboard genérico.
 *
 * `next/font` baixa e hospeda as fontes junto do app: sem request para o
 * Google em runtime (importa num PWA que roda no wifi do salão) e sem o pulo
 * de layout do FOUT.
 */
const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SPOT CLIMA — Pesquisa de Clima Organizacional',
  description: 'Sistema de Pesquisa de Clima Organizacional do Restaurante Spot',
  robots: { index: false, follow: false },
  // O manifesto é o que permite instalar o sistema na tela de início. No
  // iPhone isso não é enfeite: o Safari só entrega aviso por push para um app
  // instalado — no navegador comum, a permissão nem é oferecida.
  manifest: '/manifest.webmanifest',
  applicationName: 'SPOT CLIMA',
  appleWebApp: {
    capable: true,
    title: 'SPOT CLIMA',
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
  themeColor: '#0B0B0B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
