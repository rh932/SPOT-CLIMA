import type { Config } from 'tailwindcss';

/** Cor vinda de variável CSS em canais RGB, com suporte a `/opacidade`. */
const c = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        spot: {
          // Toda cor é uma variável CSS definida em src/app/globals.css, com
          // um valor para o modo claro e outro para o escuro (que segue o
          // aparelho). O formato em canais RGB é o que permite o modificador
          // de opacidade do Tailwind (`bg-spot-black/50`) — com `var(--x)`
          // puro ele era ignorado.
          //
          // Leitura dos nomes: `black` é a TINTA FORTE (superfície invertida,
          // botão secundário, texto de ênfase) — no escuro ela vira clara.
          // Para texto em cima dela use `onBlack`, nunca `text-white`: era
          // exatamente isso que sumia no modo escuro antigo.
          black: c('--spot-black'),
          onBlack: c('--spot-on-black'),
          charcoal: '#1A1A1A',
          yellow: c('--spot-yellow'),
          yellowDark: c('--spot-yellow-dark'),
          /** Texto sobre o amarelo: escuro nos dois modos. */
          onYellow: c('--spot-on-yellow'),
          white: c('--spot-white'),
          cream: c('--spot-cream'),
          gray: {
            50: c('--spot-gray-50'),
            100: c('--spot-gray-100'),
            200: c('--spot-gray-200'),
            300: c('--spot-gray-300'),
            400: c('--spot-gray-400'),
            500: c('--spot-gray-500'),
            600: c('--spot-gray-600'),
            700: c('--spot-gray-700'),
            800: c('--spot-gray-800'),
            900: c('--spot-gray-900'),
          },
          // Preenchimento de gráfico: fixos, iguais nos dois modos.
          favorable: '#1F9D55',
          neutral: '#D9AE00',
          unfavorable: '#D64545',
          // Cores de ESTADO para texto, filete e ponto. Contrastes medidos com
          // src/lib/contrast.ts estão em globals.css, junto dos valores.
          // O `warning` é só filete/ponto — como texto, use `warningInk`.
          danger: c('--spot-danger'),
          dangerDark: c('--spot-danger-dark'),
          /** Fundo de botão destrutivo (texto branco): fixo nos dois modos. */
          dangerFill: '#C93A3A',
          dangerFillHover: '#A82E2E',
          success: c('--spot-success'),
          warning: c('--spot-warning'),
          warningInk: c('--spot-warning-ink'),
          // Barra de navegação: escura nos dois modos.
          sidebar: c('--spot-sidebar'),
          sidebarText: c('--spot-sidebar-text'),
          accent: c('--spot-yellow'),
        },
      },
      // As variáveis vêm de next/font em src/app/layout.tsx, que explica o
      // papel de cada família. Fallback de sistema em todas: se a fonte não
      // chegar, a tela continua legível com a métrica mais parecida.
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // Sombra de repouso dos blocos do painel: rasa, sem reação ao mouse.
        card: '0 1px 2px rgba(20,20,15,0.05), 0 4px 14px -6px rgba(20,20,15,0.08)',
      },
      // Raio da linguagem "Painel Spot" (ver MASTER.md): bloco grande, controle médio.
      borderRadius: {
        xl2: '0.875rem',
        btn: '0.5rem',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        checkPop: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Deriva lenta das formas decorativas da capa — só em elementos
        // aria-hidden, nunca em conteúdo.
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -12px, 0)' },
        },
        // Entrada lateral usada nos blocos da capa da pesquisa.
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-14px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(14px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // Cartão do título: entra com um leve exagero, como um carimbo.
        stampIn: {
          '0%': { opacity: '0', transform: 'scale(0.92) rotate(-1.2deg)' },
          '70%': { opacity: '1', transform: 'scale(1.02) rotate(0.3deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0)' },
        },
        // Respiro discreto no botão principal, para o olho achar a ação.
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
        // Painel de login subindo pela base da tela (LoginCover).
        sheetUp: {
          '0%': { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        sheetDown: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(100%)' },
        },
        // A capa recua um pouco enquanto o painel sobe, dando profundidade.
        coverRecede: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.97)', opacity: '0.45' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out both',
        // Sem "both"/"forwards" de propósito: um transform retido (mesmo
        // translateY(0)) faz o elemento virar containing block de qualquer
        // descendente position:fixed — isso quebrava modais (fixed inset-0)
        // aninhados dentro do wrapper de página que usa esta animação
        // (AdminChrome/GestorChrome), prendendo o overlay ao invés da viewport.
        fadeInUp: 'fadeInUp 0.35s ease-out',
        scaleIn: 'scaleIn 0.2s ease-out both',
        checkPop: 'checkPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        drift: 'drift 9s ease-in-out infinite',
        driftSlow: 'drift 13s ease-in-out infinite',
        slideInLeft: 'slideInLeft 0.45s ease-out both',
        slideInRight: 'slideInRight 0.45s ease-out both',
        stampIn: 'stampIn 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) both',
        breathe: 'breathe 3.5s ease-in-out infinite',
        sheetUp: 'sheetUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        sheetDown: 'sheetDown 0.3s ease-in both',
        coverRecede: 'coverRecede 0.45s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
