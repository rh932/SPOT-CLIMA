import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  console.log('Aplicando migrações...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrações aplicadas com sucesso.');
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao aplicar migrações:', err);
  process.exit(1);
});
