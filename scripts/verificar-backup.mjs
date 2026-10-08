/**
 * Prova que um backup RESTAURA, não só que decifra.
 *
 * A conferência do backup-db.mjs garante que o arquivo volta ao mesmo SQL;
 * isto aqui garante que esse SQL entra num banco: decifra em memória, roda
 * num banco DESCARTÁVEL já migrado e compara a contagem de linhas de cada
 * tabela com o que o próprio dump diz ter exportado.
 *
 * Uso: npm run db:verify-backup -- <arquivo.sql.gz.enc> <URL de um banco descartável>
 *
 * Recusa rodar no banco do .env (produção): o dump começa inserindo em tudo.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import pg from 'pg';
import { MAGIC, getPassphrase } from './backupCrypto.mjs';

const [arquivo, alvo] = process.argv.slice(2);
if (!arquivo || !alvo) {
  console.error('Uso: npm run db:verify-backup -- <arquivo.sql.gz.enc> <URL de um banco descartável>');
  process.exit(1);
}
if (process.env.DATABASE_URL && alvo.trim() === process.env.DATABASE_URL.trim()) {
  console.error('Esse é o banco do .env. Use um banco descartável (vazio e migrado).');
  process.exit(1);
}

function decifrar(caminho, frase) {
  const buf = fs.readFileSync(caminho);
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Não é um backup cifrado do SPOT CLIMA.');
  const sal = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const tag = buf.subarray(buf.length - 16);
  const chave = crypto.scryptSync(frase, sal, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const d = crypto.createDecipheriv('aes-256-gcm', chave, iv);
  d.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(36, buf.length - 16)), d.final()])).toString('utf8');
}

const sql = decifrar(arquivo, getPassphrase());
const esperado = new Map([...sql.matchAll(/^-- (\w+): (\d+) row\(s\)$/gm)].map((m) => [m[1], Number(m[2])]));

const client = new pg.Client({ connectionString: alvo });
await client.connect();
try {
  const { rows: tabelas } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  for (const { table_name: t } of tabelas) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    if (rows[0].n > 0) throw new Error(`O banco de destino não está vazio (${t} tem ${rows[0].n} linhas).`);
  }
  // Um comando por vez, como o psql: o 1º que falhar aborta a transação e
  // aparece com o número dele (um INSERT só pode quebrar linha dentro de texto).
  const comandos = [];
  let atual = [];
  for (const linha of sql.split('\n')) {
    if (/^(INSERT INTO |SET |BEGIN;|COMMIT;)/.test(linha) && atual.length) {
      comandos.push(atual.join('\n'));
      atual = [];
    }
    if (atual.length || /^(INSERT INTO |SET |BEGIN;|COMMIT;)/.test(linha)) atual.push(linha);
  }
  if (atual.length) comandos.push(atual.join('\n'));
  for (let i = 0; i < comandos.length; i++) {
    try {
      await client.query(comandos[i]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Comando ${i + 1} de ${comandos.length} falhou: ${err.message}\n${comandos[i].slice(0, 160)}...`);
    }
  }
  let ok = true;
  for (const [tabela, n] of esperado) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${tabela}"`);
    const bate = rows[0].n === n;
    if (!bate) ok = false;
    if (!bate || n > 0) console.log(`${bate ? 'ok  ' : 'DIFERE'} ${tabela}: esperado ${n}, restaurado ${rows[0].n}`);
  }
  console.log(ok ? 'Backup restaurado e conferido.' : 'O backup NÃO restaurou igual.');
  process.exitCode = ok ? 0 : 1;
} finally {
  await client.end();
}
