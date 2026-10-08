/**
 * Dump periódico do banco (somente leitura).
 *
 * Substitui o passo manual do README (`pg_dump` + `date` em bash), que não
 * funciona no PowerShell e exige o cliente PostgreSQL instalado. Usa o
 * driver `pg` já existente no projeto.
 *
 * - Lê DATABASE_URL do .env
 * - Escreve um SQL data-only em backups/ (fora do git)
 * - Nunca sobrescreve um dump anterior (timestamp no nome)
 * - Não imprime a connection string nem o conteúdo das linhas
 *
 * Uso: npm run db:backup
 *
 * Restaurar (banco já migrado, vazio ou truncado):
 *   psql "$DATABASE_URL" -f backups/spot-clima-YYYYMMDD-HHMMSS.sql
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const BATCH = 200;
const OUT_DIR = path.join(process.cwd(), 'backups');

if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrado no .env.');
  process.exit(1);
}

function ident(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'bigint') return `${value}`;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'::timestamptz`;
  }
  if (Buffer.isBuffer(value)) {
    return `'\\x${value.toString('hex')}'`;
  }
  if (Array.isArray(value)) {
    return `ARRAY[${value.map(sqlLiteral).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return `${quote(JSON.stringify(value))}::jsonb`;
  }
  return quote(String(value));
}

function quote(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function orderedTables(client) {
  const { rows: tables } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);
  const names = tables.map((r) => r.table_name);
  const nameSet = new Set(names);

  const { rows: fks } = await client.query(`
    SELECT
      tc.table_name AS child,
      ccu.table_name AS parent
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);

  const remaining = new Set(names);
  const parentsOf = new Map(names.map((n) => [n, new Set()]));
  for (const { child, parent } of fks) {
    if (!nameSet.has(child) || !nameSet.has(parent) || child === parent) continue;
    parentsOf.get(child).add(parent);
  }

  const ordered = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((t) => [...parentsOf.get(t)].every((p) => !remaining.has(p)))
      .sort();
    if (ready.length === 0) {
      ordered.push(...[...remaining].sort());
      break;
    }
    for (const t of ready) {
      remaining.delete(t);
      ordered.push(t);
    }
  }
  return ordered;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `spot-clima-${stamp()}.sql`);
  if (fs.existsSync(file)) {
    console.error(`Arquivo já existe: ${file}`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  const out = fs.createWriteStream(file, { encoding: 'utf8' });

  const write = (chunk) =>
    new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      out.once('error', onError);
      if (out.write(chunk)) {
        out.off('error', onError);
        resolve();
      } else {
        out.once('drain', () => {
          out.off('error', onError);
          resolve();
        });
      }
    });

  try {
    await client.query('BEGIN READ ONLY');
    const tables = await orderedTables(client);

    await write(`-- SPOT CLIMA data dump (read-only export)\n`);
    await write(`-- Generated at ${new Date().toISOString()}\n`);
    await write(`-- Restore into a migrated database (truncate first if needed).\n`);
    await write(`SET client_encoding = 'UTF8';\n`);
    await write(`BEGIN;\n\n`);

    let totalRows = 0;
    for (const table of tables) {
      const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM ${ident(table)}`);
      const n = countRes.rows[0].n;
      await write(`-- ${table}: ${n} row(s)\n`);
      console.log(`${table}: ${n}`);

      if (n === 0) {
        await write('\n');
        continue;
      }

      let offset = 0;
      while (offset < n) {
        const { rows } = await client.query(
          `SELECT * FROM ${ident(table)} ORDER BY ctid OFFSET $1 LIMIT $2`,
          [offset, BATCH]
        );
        if (rows.length === 0) break;
        const cols = Object.keys(rows[0]).map(ident).join(', ');
        for (const row of rows) {
          const values = Object.values(row).map(sqlLiteral).join(', ');
          await write(`INSERT INTO ${ident(table)} (${cols}) VALUES (${values});\n`);
        }
        offset += rows.length;
        totalRows += rows.length;
      }
      await write('\n');
    }

    await write('COMMIT;\n');
    await client.query('COMMIT');
    await new Promise((resolve, reject) => {
      out.end((err) => (err ? reject(err) : resolve()));
    });

    const bytes = fs.statSync(file).size;
    console.log(`Backup gravado: ${path.relative(process.cwd(), file)} (${bytes} bytes, ${totalRows} linhas, ${tables.length} tabelas)`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    out.destroy();
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha no backup:', err.message || err);
  process.exit(1);
});
