/**
 * Criptografia dos dumps do banco (usada por backup-db.mjs e decrypt-backup.mjs).
 *
 * Os dumps têm nome, admissão, desligamento e avaliação de cada funcionário.
 * Em texto puro, qualquer cópia da pasta (sincronização de nuvem, pen drive,
 * deploy sem .vercelignore) vazava tudo. Agora o arquivo sai assim:
 *
 *   SPOTBKP1 | sal (16) | iv (12) | gzip(SQL) cifrado com AES-256-GCM | tag (16)
 *
 * A chave vem de BACKUP_PASSPHRASE (no .env) via scrypt com o sal do próprio
 * arquivo. Sem a frase, o arquivo não abre; com o arquivo alterado, a tag não
 * confere e a decifração falha em vez de devolver SQL corrompido.
 *
 * O SQL em texto puro nunca é gravado em disco: ele entra no gzip e no cifrador
 * enquanto é gerado, e a conferência decifra direto para um hash.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAGIC = Buffer.from('SPOTBKP1');
export const EXTENSION = '.sql.gz.enc';
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN;

export function getPassphrase() {
  const pass = process.env.BACKUP_PASSPHRASE;
  if (!pass || pass.length < 24) {
    throw new Error('BACKUP_PASSPHRASE ausente ou curta (mínimo 24 caracteres) no .env.');
  }
  return pass;
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/**
 * Abre `destPath` para gravação cifrada. Escreva o SQL em `input` e chame
 * `finish()`, que devolve o SHA-256 do texto puro para a conferência.
 */
export function createEncryptedWriter(destPath, passphrase) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const plainHash = crypto.createHash('sha256');

  const file = fs.createWriteStream(destPath, { flags: 'wx' });
  file.write(Buffer.concat([MAGIC, salt, iv]));

  const gzip = zlib.createGzip({ level: 9 });
  const done = pipeline(gzip, cipher, file, { end: false });

  let input;
  // Falha no meio (disco cheio, abort): sem este handler a promise rejeitada
  // derrubava o processo antes do catch do chamador, deixando um arquivo
  // truncado com nome de backup válido. O erro vai para a entrada (a escrita
  // em curso falha) e reaparece no `await done` de finish().
  done.catch((err) => input?.destroy(err));

  input = new Writable({
    write(chunk, encoding, cb) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      plainHash.update(buf);
      if (gzip.write(buf)) cb();
      else gzip.once('drain', cb);
    },
    final(cb) {
      gzip.end();
      cb();
    },
  });

  async function finish() {
    await new Promise((resolve, reject) => input.end((err) => (err ? reject(err) : resolve())));
    await done;
    await new Promise((resolve, reject) => file.end(cipher.getAuthTag(), (err) => (err ? reject(err) : resolve())));
    return plainHash.digest('hex');
  }

  function abort() {
    gzip.destroy();
    file.destroy();
  }

  return { input, finish, abort };
}

function openEncrypted(srcPath, passphrase) {
  const size = fs.statSync(srcPath).size;
  if (size < HEADER_LEN + TAG_LEN) throw new Error('Arquivo pequeno demais para ser um backup.');

  const fd = fs.openSync(srcPath, 'r');
  const header = Buffer.alloc(HEADER_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  try {
    fs.readSync(fd, header, 0, HEADER_LEN, 0);
    fs.readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    fs.closeSync(fd);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Não é um backup cifrado do SPOT CLIMA.');
  }
  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = header.subarray(MAGIC.length + SALT_LEN, HEADER_LEN);

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  const body = fs.createReadStream(srcPath, { start: HEADER_LEN, end: size - TAG_LEN - 1 });
  return [body, decipher, zlib.createGunzip()];
}

/** Destino que só acumula o SHA-256 do que passa por ele. */
function hashSink(hash) {
  return new Writable({
    write(chunk, _enc, cb) {
      hash.update(chunk);
      cb();
    },
  });
}

function explain(err) {
  if (/auth|unable to authenticate|header check|invalid|unexpected end/i.test(String(err?.message))) {
    return new Error('Frase errada ou arquivo alterado: a verificação de integridade falhou.');
  }
  return err;
}

/** Decifra e descomprime `srcPath` em `destPath` (que não pode existir). */
export async function decryptFile(srcPath, destPath, passphrase) {
  try {
    await pipeline(...openEncrypted(srcPath, passphrase), fs.createWriteStream(destPath, { flags: 'wx' }));
  } catch (err) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      // nada a limpar
    }
    throw explain(err);
  }
}

/** SHA-256 do texto puro de um backup cifrado, sem gravar o texto em disco. */
export async function hashDecrypted(srcPath, passphrase) {
  const hash = crypto.createHash('sha256');
  try {
    await pipeline(...openEncrypted(srcPath, passphrase), hashSink(hash));
  } catch (err) {
    throw explain(err);
  }
  return hash.digest('hex');
}

/** SHA-256 de um arquivo comum (usado ao cifrar os dumps antigos em texto puro). */
export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hashSink(hash));
  return hash.digest('hex');
}
