/**
 * Importa o Cadastro Geral de Funcionários do DP (aba ATIVOS) para o Spot Integra,
 * com as mesmas regras da tela /admin/employees/importar.
 *
 * Por padrão só MOSTRA o que faria (simulação, só leitura). Grava apenas com
 * --gravar, num único INSERT. Quem já existe na unidade (mesmo nome) é ignorado.
 *
 *   npx tsx scripts/import-cadastro-geral.ts --arquivo "<planilha.xlsx>" --unidade Paulista
 *   npx tsx scripts/import-cadastro-geral.ts --arquivo "<planilha.xlsx>" --unidade Paulista --gravar
 *   --setor-de-para "CAIXA=Delivery"   usa outro setor para um setor da planilha que não existe no sistema
 */
import 'dotenv/config';
import fs from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db';
import * as schema from '../src/db/schema';
import { readXlsxMatrix, previewEmployeeRows, matchLookup } from '../src/lib/importFuncionarios';
import { cycleFieldsFor } from '../src/lib/employeeCreate';
import { logAudit } from '../src/lib/audit';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const arquivo = arg('arquivo');
  const unidade = arg('unidade');
  const gravar = process.argv.includes('--gravar');
  if (!arquivo || !unidade) throw new Error('Informe --arquivo e --unidade.');

  const [units, sectors, existing] = await Promise.all([
    db.query.units.findMany({ where: eq(schema.units.active, true), columns: { id: true, name: true } }),
    db.query.sectors.findMany({
      where: and(eq(schema.sectors.active, true), eq(schema.sectors.inEvaluation, true)),
      columns: { id: true, name: true },
    }),
    db.query.probationaryEmployees.findMany({ columns: { fullName: true, unitId: true } }),
  ]);
  const defaultUnit = matchLookup(units, unidade).item;
  if (!defaultUnit) throw new Error(`Unidade "${unidade}" não encontrada. Existem: ${units.map((u) => u.name).join(', ')}`);

  const b = fs.readFileSync(arquivo);
  const matrix = await readXlsxMatrix(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const dePara = arg('setor-de-para')?.split('=');
  if (dePara?.length === 2) {
    const hr = matrix.findIndex((r, i) => i < 10 && r.some((c) => String(c ?? '').trim().toUpperCase() === 'SETOR'));
    const ci = hr >= 0 ? matrix[hr].findIndex((c) => String(c ?? '').trim().toUpperCase() === 'SETOR') : -1;
    if (ci >= 0) for (let i = hr + 1; i < matrix.length; i++) if (String(matrix[i]?.[ci] ?? '').trim().toUpperCase() === dePara[0].trim().toUpperCase()) matrix[i][ci] = dePara[1].trim();
  }
  const prev = previewEmployeeRows(matrix, { units, sectors, existing, defaultUnit });

  console.log(`Banco: ${units.length} unidades, ${existing.length} colaboradores. Setores: ${sectors.map((s) => s.name).join(', ')}`);
  console.log('Notas:', prev.notes, 'Erros do arquivo:', prev.fileErrors);
  console.log('Contagem:', prev.counts);
  const porSetor: Record<string, number> = {};
  for (const r of prev.rows.filter((x) => x.status === 'OK')) porSetor[r.sectorName] = (porSetor[r.sectorName] ?? 0) + 1;
  console.log('A importar por setor:', porSetor);
  console.log('Novos (experiência):', prev.rows.filter((r) => r.status === 'OK' && r.track === 'NOVO').map((r) => `${r.fullName} (linha ${r.line})`));
  console.log('Aprendizes:', prev.rows.filter((r) => r.status === 'OK' && r.isApprentice).map((r) => r.fullName));
  console.log('Noturnos:', prev.rows.filter((r) => r.status === 'OK' && r.shift === 'NOITE').length);
  for (const r of prev.rows.filter((x) => x.status !== 'OK')) console.log(`  ${r.status} linha ${r.line} ${r.fullName}: ${r.messages.join(' | ')}`);

  if (!gravar) { console.log('\nSIMULAÇÃO: nada foi gravado. Use --gravar para gravar.'); return; }

  const ok = prev.rows.filter((r) => r.status === 'OK' && r.unitId && r.sectorId);
  if (ok.length === 0) { console.log('Nada a gravar.'); return; }
  const values = ok.map((r) => {
    const admissionDate = r.admissionDate ? new Date(r.admissionDate) : new Date();
    return {
      fullName: r.fullName, admissionDate, roleDescription: r.roleDescription,
      sectorId: r.sectorId!, unitId: r.unitId!, shift: r.shift,
      ...cycleFieldsFor(r.track, admissionDate, r.isApprentice),
      createdById: null,
    } as typeof schema.probationaryEmployees.$inferInsert;
  });
  await db.insert(schema.probationaryEmployees).values(values);
  await logAudit({ adminId: null, action: 'employee.import', entityType: 'ProbationaryEmployee', metadata: { importados: values.length, origem: 'script cadastro geral', unidade: defaultUnit.name } });
  console.log(`\nGRAVADO: ${values.length} colaboradores em ${defaultUnit.name}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
