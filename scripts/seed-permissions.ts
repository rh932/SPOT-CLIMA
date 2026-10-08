/**
 * Espelha o catálogo de permissões (src/lib/permissions.ts — fonte única da
 * verdade) nas tabelas `permissions` e `role_permissions`. Idempotente: pode
 * rodar quantas vezes quiser, inclusive depois de adicionar permissões novas
 * ao catálogo.
 *
 * Rodar depois das migrações: npm run db:seed-permissions
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, type Role } from '../src/lib/permissions';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  await db
    .insert(schema.permissions)
    .values(PERMISSIONS.map((p) => ({ key: p.key, label: p.label, category: p.category })))
    .onConflictDoUpdate({
      target: schema.permissions.key,
      set: { label: sql`excluded.label`, category: sql`excluded.category` },
    });

  const rows = Object.entries(DEFAULT_ROLE_PERMISSIONS).flatMap(([role, keys]) =>
    keys.map((permissionKey) => ({ role: role as Role, permissionKey })),
  );
  await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();

  console.log(`${PERMISSIONS.length} permissões e ${rows.length} vínculos por papel sincronizados.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao semear permissões:', err);
  process.exit(1);
});
