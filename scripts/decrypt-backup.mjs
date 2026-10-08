/**
 * Abre um backup cifrado por backup-db.mjs para restaurar.
 *
 * Uso: npm run db:decrypt-backup -- <arquivo.sql.gz.enc> <saida.sql>
 *
 * A saída é SQL em texto puro com dados pessoais: grave fora da pasta do
 * projeto, restaure com psql e apague o arquivo em seguida.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { decryptFile, getPassphrase } from './backupCrypto.mjs';

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error('Uso: npm run db:decrypt-backup -- <arquivo.sql.gz.enc> <saida.sql>');
  process.exit(1);
}
if (fs.existsSync(dest)) {
  console.error(`A saída já existe e não será sobrescrita: ${dest}`);
  process.exit(1);
}
if (path.resolve(dest).startsWith(path.resolve(process.cwd()) + path.sep)) {
  console.error('Grave a saída fora da pasta do projeto (ela tem dados pessoais em texto puro).');
  process.exit(1);
}

decryptFile(src, dest, getPassphrase())
  .then(() => console.log(`Backup aberto em ${dest}. Apague este arquivo depois de restaurar.`))
  .catch((err) => {
    console.error('Falha ao abrir o backup:', err.message || err);
    process.exit(1);
  });
