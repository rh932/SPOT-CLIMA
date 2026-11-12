/**
 * Dump periódico do banco (somente leitura), comprimido e criptografado.
 *
 * Usa o driver `pg` já existente no projeto (o PowerShell não tem pg_dump).
 *
 * - Lê DATABASE_URL e BACKUP_PASSPHRASE do .env
 * - Grava FORA da pasta do projeto (BACKUP_DIR; padrão: Documentos\spot-clima-backups),
 *   para o dump nunca subir num deploy nem entrar numa cópia da pasta
 * - Cifra com AES-256-GCM enquanto gera (scripts/backupCrypto.mjs): o SQL em
 *   texto puro nunca toca o disco
 * - Confere o arquivo depois de gravar: decifra e compara o hash com o gerado
 * - Mantém só os BACKUP_KEEP mais recentes (padrão 30)
 * - Nunca sobrescreve um dump anterior (timestamp no nome)
 * - Não imprime a connection string nem o conteúdo das linhas
 *
 * Uso: npm run db:backup
 * Agendado: scripts/agendar-backup.ps1 (tarefa diária do Windows)
 *
 * Restaurar (banco já migrado, vazio ou truncado):
 *   npm run db:decrypt-backup -- <arquivo.sql.gz.enc> <saida.sql>
 *   psql "$DATABASE_URL" -f <saida.sql>    (apague o .sql depois)
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { EXTENSION, createEncryptedWriter, getPassphrase, hashDecrypted } from './backupCrypto.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
const BATCH = 200;
const OUT_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), 'Documents', 'spot-clima-backups');
const KEEP = Math.max(1, Number.parseInt(process.env.BACKUP_KEEP || '30', 10) || 30);

if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrado no .env.');
  process.exit(1);
}

function ident(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

// Datas e horas saem como o TEXTO do banco, sem passar por Date: o `pg` lê
// `timestamp` sem fuso como hora local da máquina, e o dump gravava +3h.
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;
const DATE = 1082;
const JSON_OID = 114;
const JSONB = 3802;
for (const oid of [TIMESTAMP, TIMESTAMPTZ, DATE]) pg.types.setTypeParser(oid, (v) => v);

/**
 * Literal SQL de um valor, pelo TIPO DA COLUNA (dataTypeID do resultado), não
 * pelo tipo do valor em JS. Uma coluna jsonb que guarda array chega como
 * array JS, e uma que guarda texto chega como string — antes isso virava
 * `ARRAY[...]` (text[]) ou texto sem ::jsonb, e o INSERT falhava na restauração.
 */
function columnLiteral(value, typeId) {
  if (value === null || value === undefined) return 'NULL';
  if (typeId === JSONB || typeId === JSON_OID) {
    return `${quote(JSON.stringify(value))}::${typeId === JSONB ? 'jsonb' : 'json'}`;
  }
  if (typeId === TIMESTAMP) return `${quote(String(value))}::timestamp`;
  if (typeId === TIMESTAMPTZ) return `${quote(String(value))}::timestamptz`;
  if (typeId === DATE) return `${quote(String(value))}::date`;
  return sqlLiteral(value);
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

/** Apaga os backups cifrados mais antigos, mantendo os KEEP mais recentes. */
function applyRetention() {
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.startsWith('spot-clima-') && f.endsWith(EXTENSION))
    .sort(); // o timestamp no nome ordena do mais antigo para o mais novo
  const excess = files.slice(0, Math.max(0, files.length - KEEP));
  for (const f of excess) fs.unlinkSync(path.join(OUT_DIR, f));
  if (excess.length > 0) console.log(`Retenção: ${excess.length} backup(s) antigo(s) removido(s), ${KEEP} mantido(s).`);
}

async function main() {
  const passphrase = getPassphrase();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `spot-clima-${stamp()}${EXTENSION}`);
  if (fs.existsSync(file)) {
    console.error(`Arquivo já existe: ${file}`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  const enc = createEncryptedWriter(file, passphrase);
  const out = enc.input;

  const write = (chunk) =>
    new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      out.once('error', onError);
      if (out.write(chunk, 'utf8')) {
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

    await write(`-- Spot Integra data dump (read-only export)\n`);
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
        const { rows, fields } = await client.query(
          `SELECT * FROM ${ident(table)} ORDER BY ctid OFFSET $1 LIMIT $2`,
          [offset, BATCH]
        );
        if (rows.length === 0) break;
        const cols = fields.map((f) => ident(f.name)).join(', ');
        for (const row of rows) {
          const values = fields.map((f) => columnLiteral(row[f.name], f.dataTypeID)).join(', ');
          await write(`INSERT INTO ${ident(table)} (${cols}) VALUES (${values});\n`);
        }
        offset += rows.length;
        totalRows += rows.length;
      }
      await write('\n');
    }

    await write('COMMIT;\n');
    await client.query('COMMIT');
    const plainHash = await enc.finish();

    // Conferência: o arquivo gravado precisa decifrar de volta para o mesmo SQL.
    if ((await hashDecrypted(file, passphrase)) !== plainHash) {
      throw new Error('O arquivo cifrado não confere com o que foi gerado.');
    }

    const bytes = fs.statSync(file).size;
    console.log(`Backup gravado e conferido: ${file} (${bytes} bytes cifrados, ${totalRows} linhas, ${tables.length} tabelas)`);
    applyRetention();
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    enc.abort();
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
