/**
 * Importa as fotos dos colaboradores do Convênia para o Spot Integra.
 *
 * Entrada: um JSON com as fotos tiradas do Convênia (nome, unidade e endereço da
 * foto), gerado com a conta do próprio RH no app.convenia.com.br:
 *   [{ "nome": "ANA SILVA", "unidade": "Paulista", "url": "https://s3.amazonaws.com/storage-api.rh.live.convenia.com.br/..." }]
 *
 * Por padrão só SIMULA (mostra quem casou, quem não achou, quem é ambíguo).
 * Grava apenas com --gravar. Cada foto é baixada do bucket público do Convênia,
 * reduzida a 256x256 (JPEG) e guardada em employee_photos; rodar de novo
 * substitui a foto anterior da mesma pessoa.
 *
 *   npx tsx scripts/import-fotos-convenia.ts --arquivo fotos.json
 *   npx tsx scripts/import-fotos-convenia.ts --arquivo fotos.json --gravar
 */
import 'dotenv/config';
import fs from 'node:fs';
import { db } from '../src/db';
import * as schema from '../src/db/schema';
import { casarFotos, urlDeFotoValida, type FotoConvenia } from '../src/lib/fotosConvenia';
import { MAX_FOTO_BYTES } from '../src/lib/employeePhoto';
import { logAudit } from '../src/lib/audit';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const MAX_BAIXADO = 8 * 1024 * 1024;

async function reduzir(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  return sharp(bytes).rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
}

async function baixar(url: URL): Promise<Buffer> {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > MAX_BAIXADO) throw new Error('arquivo grande demais');
  return b;
}

async function main() {
  const arquivo = arg('arquivo');
  const gravar = process.argv.includes('--gravar');
  if (!arquivo) throw new Error('Informe --arquivo <fotos.json>.');
  const fotos = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as FotoConvenia[];
  if (!Array.isArray(fotos)) throw new Error('O JSON precisa ser uma lista.');

  const pessoas = await db.query.probationaryEmployees.findMany({
    columns: { id: true, fullName: true, unitId: true },
    with: { unit: { columns: { name: true } } },
  });
  const resultados = casarFotos(
    fotos,
    pessoas.map((p) => ({ id: p.id, fullName: p.fullName, unitId: p.unitId, unitName: p.unit.name })),
  );

  const ok = resultados.filter((r) => r.tipo === 'OK');
  console.log(`Fotos no arquivo: ${fotos.length}. Casadas: ${ok.length}. Colaboradores no banco: ${pessoas.length}.`);
  for (const tipo of ['SEM_COLABORADOR', 'AMBIGUO', 'URL_INVALIDA'] as const) {
    const lista = resultados.filter((r) => r.tipo === tipo);
    if (lista.length) console.log(`${tipo} (${lista.length}):`, lista.map((r) => `${r.foto.nome}${r.foto.unidade ? ` [${r.foto.unidade}]` : ''}`));
  }
  const comFoto = new Set(ok.map((r) => (r.tipo === 'OK' ? r.colaborador.id : '')));
  const semFoto = pessoas.filter((p) => !comFoto.has(p.id));
  console.log(`Colaboradores que ficarão sem foto: ${semFoto.length}`);

  if (!gravar) { console.log('\nSIMULAÇÃO: nada foi baixado nem gravado. Use --gravar para gravar.'); return; }

  let gravadas = 0;
  const falhas: string[] = [];
  for (const r of ok) {
    if (r.tipo !== 'OK') continue;
    try {
      const url = urlDeFotoValida(r.foto.url)!;
      const jpeg = await reduzir(await baixar(url));
      if (jpeg.length > MAX_FOTO_BYTES) throw new Error('foto reduzida ainda grande demais');
      await db.insert(schema.employeePhotos)
        .values({ employeeId: r.colaborador.id, contentType: 'image/jpeg', data: jpeg, source: 'CONVENIA' })
        .onConflictDoUpdate({ target: schema.employeePhotos.employeeId, set: { data: jpeg, contentType: 'image/jpeg', source: 'CONVENIA', updatedAt: new Date() } });
      gravadas++;
    } catch (e) {
      falhas.push(`${r.foto.nome}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await logAudit({ adminId: null, action: 'employee.photo.import', entityType: 'ProbationaryEmployee', metadata: { gravadas, falhas: falhas.length, origem: 'script fotos convenia' } });
  console.log(`\nGRAVADO: ${gravadas} fotos.${falhas.length ? ` Falhas (${falhas.length}):` : ''}`);
  for (const f of falhas) console.log('  ', f);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
