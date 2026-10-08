/**
 * Cria/atualiza os formulários de treinamento a partir de src/data/trainingBank.ts.
 * Idempotente: pode rodar de novo quando um formulário novo for transcrito.
 *
 *   npm run db:seed-training
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { TRAINING_FORMS } from '../src/data/trainingBank';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  for (const form of TRAINING_FORMS) {
    let type = await db.query.trainingTypes.findFirst({
      where: eq(schema.trainingTypes.name, form.typeName),
    });

    const typeValues = {
      contextFields: form.contextFields,
      ratingOptions: form.ratingOptions,
      positiveLabel: form.positiveLabel,
      negativeLabel: form.negativeLabel,
      ...(form.description ? { description: form.description } : {}),
    };

    if (!type) {
      [type] = await db.insert(schema.trainingTypes)
        .values({ name: form.typeName, ...typeValues })
        .returning();
      console.log(`Tipo criado: ${form.typeName}`);
    } else {
      await db.update(schema.trainingTypes)
        .set(typeValues)
        .where(eq(schema.trainingTypes.id, type.id));
      console.log(`Tipo atualizado: ${form.typeName}`);
    }

    // Critérios: insere o que falta e mantém a ordem do formulário. Não apaga
    // os existentes — treinamentos já registrados apontam para eles.
    let novos = 0;
    for (const [i, criterion] of form.criteria.entries()) {
      const existing = await db.query.trainingCriteria.findFirst({
        where: and(
          eq(schema.trainingCriteria.trainingTypeId, type.id),
          eq(schema.trainingCriteria.label, criterion.label),
        ),
      });
      if (existing) {
        await db.update(schema.trainingCriteria)
          .set({ hint: criterion.hint ?? null, order: i + 1, active: true })
          .where(eq(schema.trainingCriteria.id, existing.id));
      } else {
        await db.insert(schema.trainingCriteria).values({
          trainingTypeId: type.id,
          label: criterion.label,
          hint: criterion.hint ?? null,
          order: i + 1,
        });
        novos++;
      }
    }
    console.log(`  ${form.criteria.length} critérios (${novos} novo(s)).`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao semear formulários de treinamento:', err);
  process.exit(1);
});
