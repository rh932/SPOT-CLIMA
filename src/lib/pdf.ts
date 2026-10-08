import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Localiza o executável do Chromium instalado neste ambiente. Primeiro checa
 * caminhos conhecidos de ambientes de hospedagem específicos (ex.: sandbox
 * com Chromium pré-instalado fora do cache padrão do Playwright); se nenhum
 * existir, varre o cache padrão do Playwright (`~/.cache/ms-playwright` ou
 * equivalente por SO — o mesmo lugar que `npx playwright install chromium`
 * usa), que é onde ele fica em qualquer máquina de desenvolvimento normal.
 */
function resolveChromiumExecutable(): string | undefined {
  const knownHostPaths = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean) as string[];
  const known = knownHostPaths.find((p) => fs.existsSync(p));
  if (known) return known;

  const cacheRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright'));

  if (!fs.existsSync(cacheRoot)) return undefined;

  // O nome da pasta do binário mudou entre versões do Playwright
  // ("chrome-win" nas mais antigas, "chrome-win64" nas mais novas) — tenta as duas.
  const relativeExecutableCandidates =
    process.platform === 'win32'
      ? [['chrome-win64', 'chrome.exe'], ['chrome-win', 'chrome.exe']]
      : process.platform === 'darwin'
        ? [['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']]
        : [['chrome-linux', 'chrome']];

  const chromiumDirs = fs
    .readdirSync(cacheRoot)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .reverse(); // build mais recente primeiro, se houver mais de um instalado

  for (const dir of chromiumDirs) {
    for (const relativeExecutable of relativeExecutableCandidates) {
      const candidate = path.join(cacheRoot, dir, ...relativeExecutable);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Renderiza uma URL (ou HTML) interna para PDF usando o Chromium headless.
 * Usado pelo relatório executivo — a "fonte da verdade" visual é a própria
 * página HTML de impressão (`/admin/reports/[id]/print`), garantindo que o
 * PDF é idêntico ao que o RH vê na tela.
 */
/** Rodando em função serverless (Vercel/AWS), onde não existe Chromium instalado. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Como abrir o Chromium: na Vercel, o @sparticuz/chromium (binário próprio
 * para serverless, mesma versão 130 do playwright-core 1.48); na máquina, o
 * Chromium do cache do Playwright ou o de PLAYWRIGHT_CHROMIUM_PATH.
 */
async function launchOptions(): Promise<{ executablePath?: string; args: string[] }> {
  if (isServerless()) {
    const { default: serverless } = await import('@sparticuz/chromium');
    return { executablePath: await serverless.executablePath(), args: serverless.args };
  }
  return { executablePath: resolveChromiumExecutable(), args: ['--no-sandbox'] };
}

export async function renderUrlToPdf(url: string, cookieHeader?: string): Promise<Buffer> {
  const { executablePath, args } = await launchOptions();
  const browser = await chromium.launch({ executablePath, headless: true, args });
  try {
    const context = await browser.newContext();
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map((pair) => {
        const [name, ...rest] = pair.trim().split('=');
        return {
          name,
          value: rest.join('='),
          url,
        };
      });
      await context.addCookies(cookies as never);
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
