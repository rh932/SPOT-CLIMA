import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Portões de segurança estáticos: leem o código-fonte e travam regressões que
 * nenhum teste de comportamento pegaria a tempo — uma rota nova sem
 * autorização, um campo identificador na tabela de respostas, um segredo com
 * prefixo público. Rodam sem banco e sem servidor.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir: string, match: (name: string) => boolean): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) return walk(rel, match);
    return match(e.name) ? [rel] : [];
  });
}

interface Handler { file: string; method: string; body: string }

function handlers(dir: string): Handler[] {
  return walk(dir, (n) => n === 'route.ts').flatMap((file) => {
    const src = read(file);
    const parts = src.split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/);
    return parts.slice(1).map((body) => ({ file, method: body.match(/export async function (\w+)/)![1], body }));
  });
}

const label = (h: Handler) => `${h.method} ${h.file.replace('src/app/api/', '/api/').replace(/\/route\.ts$/, '')}`;

describe('autorização em toda rota', () => {
  it('toda rota /api/admin relê a conta no banco (requireAdmin) e confere permissão ou papel', () => {
    const faltando = handlers('src/app/api/admin')
      .filter((h) => !/requireAdmin\(\)/.test(h.body) || !/require(?:Any)?Permission\(|requireRole\(/.test(h.body))
      .map(label);
    expect(faltando).toEqual([]);
  });

  it('toda rota /api/gestor passa por requireGestor e por uma permissão (ou pela regra de quem avalia)', () => {
    // /api/gestor/me é "quem sou eu e o que posso": vale para qualquer conta
    // do portal, sem permissão específica.
    const SO_SESSAO = new Set(['GET /api/gestor/me']);
    const faltando = handlers('src/app/api/gestor')
      .filter((h) => !/requireGestor\(\)/.test(h.body) || !/require(?:Any)?Permission\(|canEvaluate\(/.test(h.body))
      .map(label)
      .filter((l) => !SO_SESSAO.has(l));
    expect(faltando).toEqual([]);
  });

  it('as rotas públicas são só as conhecidas (pesquisa anônima, login, primeiro acesso, cron)', () => {
    const publicas = walk('src/app/api', (n) => n === 'route.ts')
      .filter((f) => !f.startsWith('src/app/api/admin/') && !f.startsWith('src/app/api/gestor/'))
      .sort();
    expect(publicas).toEqual([
      'src/app/api/auth/first-access/route.ts',
      'src/app/api/auth/login/route.ts',
      'src/app/api/auth/logout/route.ts',
      'src/app/api/auth/me/route.ts',
      'src/app/api/cron/feedback-reminders/route.ts',
      'src/app/api/public/responses/route.ts',
      'src/app/api/public/surveys/[id]/route.ts',
      'src/app/api/public/surveys/route.ts',
    ]);
  });

  it('o cron falha fechado sem CRON_SECRET e compara o segredo em tempo constante', () => {
    const cron = read('src/app/api/cron/feedback-reminders/route.ts');
    expect(cron).toMatch(/CRON_SECRET/);
    expect(cron).toMatch(/timingSafeEqual/);
  });

  it('páginas do admin que leem o banco direto (server component) conferem a sessão no servidor', () => {
    const paginas = walk('src/app/admin', (n) => n === 'page.tsx')
      .filter((f) => !/^['"]use client['"]/.test(read(f).trimStart()))
      .filter((f) => /from '@\/db'|import \{[^}]*get\w+[^}]*\} from '@\/lib\/results'/.test(read(f)));
    expect(paginas.length).toBeGreaterThan(0);
    for (const f of paginas) expect(read(f), f).toMatch(/requireAdmin\(\)/);
  });
});

describe('dependências', () => {
  it('Next.js instalado é 14.2.25 ou mais novo (desvio de middleware, CVE-2025-29927)', () => {
    const { version } = JSON.parse(read('node_modules/next/package.json')) as { version: string };
    const [major, minor, patch] = version.split('.').map((n) => Number.parseInt(n, 10));
    const ok = major > 14 || (major === 14 && (minor > 2 || (minor === 2 && patch >= 25)));
    expect(ok, version).toBe(true);
  });
});

describe('anonimato no esquema e na rota pública', () => {
  it('survey_responses não tem nenhuma coluna além de id, pesquisa, setor, unidade e dia', () => {
    const schema = read('src/db/schema.ts');
    const bloco = schema.slice(schema.indexOf("pgTable('survey_responses'"), schema.indexOf("pgTable('response_answers'"));
    const colunas = Array.from(bloco.matchAll(/^\s{2}(\w+): (?:text|timestamp|integer|boolean|jsonb|id)\(/gm)).map((m) => m[1]);
    expect(colunas.sort()).toEqual(['createdAt', 'id', 'sectorId', 'surveyId', 'unitId']);
  });

  it('response_answers não guarda horário nem identificador', () => {
    const schema = read('src/db/schema.ts');
    const bloco = schema.slice(schema.indexOf("pgTable('response_answers'"), schema.indexOf('// Snapshot'));
    expect(bloco).not.toMatch(/timestamp\(|adminId|employeeId|email|ip/i);
  });

  it('o envio anônimo não grava auditoria, IP nem horário exato', () => {
    const rota = read('src/app/api/public/responses/route.ts');
    expect(rota).not.toMatch(/logAudit|hashIp|auditLogs/);
    expect(rota).toMatch(/createdAt: new Date\(saoPauloDay\(\)\)/);
  });

  it('getSurveyResults não carrega o created_at das respostas', () => {
    const results = read('src/lib/results.ts');
    expect(results).toMatch(/columns: \{ id: true, sectorId: true, unitId: true \}/);
  });

  it('o limite de anonimato tem piso no schema de entrada (nenhuma rota aceita menos de 5)', () => {
    const validation = read('src/lib/validation.ts');
    expect(validation).not.toMatch(/anonymityThreshold: z\.number\(\)\.int\(\)\.min\([0-4]\)/);
    for (const h of handlers('src/app/api/admin')) {
      expect(h.body, label(h)).not.toMatch(/anonymityThreshold: body\?\./);
    }
  });
});

describe('injeção, XSS e segredos', () => {
  const fontes = walk('src', (n) => /\.(ts|tsx)$/.test(n));

  it('nenhum SQL montado com texto cru (sql.raw / db.execute com string)', () => {
    for (const f of fontes) {
      const src = read(f);
      expect(src, f).not.toMatch(/sql\.raw\(|\.execute\(\s*['"`]/);
    }
  });

  it('nenhum HTML injetado sem escape (dangerouslySetInnerHTML / innerHTML / eval)', () => {
    for (const f of fontes) {
      const src = read(f);
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/);
    }
  });

  it('nenhuma variável secreta com prefixo NEXT_PUBLIC_ (que vai para o navegador)', () => {
    for (const f of fontes) {
      const nomes = Array.from(read(f).matchAll(/NEXT_PUBLIC_(\w+)/g)).map((m) => m[1]);
      for (const n of nomes) expect(n, f).not.toMatch(/SECRET|KEY|TOKEN|PASSWORD|DATABASE/);
    }
  });

  it('componentes de cliente não leem process.env de segredo', () => {
    for (const f of fontes) {
      const src = read(f);
      if (!/^['"]use client['"]/.test(src.trimStart())) continue;
      expect(src, f).not.toMatch(/process\.env\.(?!NEXT_PUBLIC_|NODE_ENV)\w+/);
    }
  });

  it('o .env com credenciais e os dumps do banco não sobem no deploy', () => {
    const ignore = read('.vercelignore');
    expect(ignore).toMatch(/^\/backups$/m);
    expect(ignore).toMatch(/^\.env$/m);
    const gitignore = read('.gitignore');
    expect(gitignore).toMatch(/^\.env$/m);
  });

  it('o .env.example não traz credencial real', () => {
    const exemplo = read('.env.example');
    // Endpoint de verdade do Neon tem a forma ep-palavra-palavra-123456.
    expect(exemplo).not.toMatch(/@ep-[a-z]+-[a-z]+-\w+\./);
    expect(exemplo).not.toMatch(/VAPID_PRIVATE_KEY="?[\w-]{20,}/);
    // Na máquina de quem desenvolve: nenhum valor do .env real aparece no modelo.
    if (fs.existsSync(path.join(ROOT, '.env'))) {
      const valores = read('.env').split(/\r?\n/)
        .map((l) => l.match(/^\s*(?:DATABASE_URL|\w*(?:SECRET|PASSWORD|PRIVATE|TOKEN)\w*)\s*=\s*"?([^"\r\n]*)"?/)?.[1] ?? '')
        .filter((v) => v.length >= 12);
      for (const v of valores) expect(exemplo.includes(v)).toBe(false);
    }
  });

  it('o JWT é verificado com algoritmo fixo (sem aceitar "none" nem troca de algoritmo)', () => {
    expect(read('src/middleware.ts')).toMatch(/algorithms: \['HS256'\]/);
    expect(read('src/lib/auth.ts')).toMatch(/algorithms: \['HS256'\]/);
  });

  it('a CSP proíbe iframe de fora, plugin e troca de base', () => {
    const config = read('next.config.js');
    for (const diretiva of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(config).toContain(diretiva);
    }
  });
});
