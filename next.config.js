/** @type {import('next').NextConfig} */
// Em desenvolvimento (`next dev`), o Next.js usa eval() internamente para o
// Fast Refresh / source maps do webpack. Uma CSP sem 'unsafe-eval' bloqueia essa
// avaliação e impede TODO o JavaScript do app de rodar no navegador (a página
// carrega, mas nenhum clique/handler funciona — ex.: o botão "Entrar" do login
// fica sem efeito). Em produção (`next build && next start`) isso não é
// necessário, então mantemos a CSP restrita apenas fora do modo dev.
const isDev = process.env.NODE_ENV !== 'production';

// 'unsafe-inline' em script-src continua: o Next 14 injeta scripts inline de
// hidratação, e tirar exigiria CSP com nonce em todas as páginas (renderização
// dinâmica em tudo). Sem nenhum dangerouslySetInnerHTML no código, o risco
// fica no que o React já escapa. As demais diretivas fecham o que dá:
// - frame-ancestors 'none': ninguém embute o painel num iframe (clickjacking);
// - base-uri / form-action 'self': uma injeção de HTML não troca a base dos
//   links nem manda um formulário para fora;
// - object-src 'none': nada de plugin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Só faz sentido com TLS já terminado na borda (Vercel serve HTTPS por padrão).
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
  { key: 'Content-Security-Policy', value: csp },
];

const nextConfig = {
  // Permite rodar um SEGUNDO processo do Next na mesma pasta sem que os dois
  // corrompam o build um do outro. Dois `next dev` (ou um dev e um build)
  // compartilhando .next produzem sintomas que imitam bug de codigo: rota que
  // existe respondendo 404 e ENOENT ao renomear .next/cache/.../*.pack.gz.
  // Sem a variavel definida, nada muda.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // Sem source map no navegador: o código-fonte do servidor e comentários
  // internos não vão para quem abre o DevTools.
  productionBrowserSourceMaps: false,
  // playwright-core (usado só na exportação de PDF) tem requires dinâmicos que
  // não devem ser processados pelo bundler do Next — mantém como pacote externo no servidor.
  experimental: {
    serverComponentsExternalPackages: ['playwright-core'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
