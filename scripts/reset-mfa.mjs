import 'dotenv/config';
import pg from 'pg';

// Desliga a verificação em duas etapas de uma conta direto no banco.
// Para quando o único Super Admin perdeu o celular e os códigos de recuperação
// (as outras contas o Super Admin zera pela aba Usuários).
//
// Uso: npm run db:reset-mfa -- email@restaurantespot.com.br
const EMAIL = process.argv[2];
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrado no .env.');
  process.exit(1);
}
if (!EMAIL) {
  console.error('Uso: npm run db:reset-mfa -- <email>');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const { rowCount } = await client.query(
    `UPDATE admins
        SET mfa_secret = NULL, mfa_pending_secret = NULL, mfa_enabled_at = NULL,
            mfa_recovery_codes = NULL, updated_at = now()
      WHERE email = $1`,
    [EMAIL.toLowerCase()],
  );
  if (rowCount === 0) {
    console.error(`Nenhuma conta com o e-mail ${EMAIL}.`);
    process.exitCode = 1;
  } else {
    await client.query(
      `INSERT INTO audit_logs (id, admin_id, action, entity_type, metadata)
       SELECT gen_random_uuid()::text, NULL, 'mfa.reset_script', 'Admin', jsonb_build_object('conta', id)
         FROM admins WHERE email = $1`,
      [EMAIL.toLowerCase()],
    );
    console.log(`Verificação em duas etapas desligada para ${EMAIL}. A pessoa entra só com a senha e pode ligar de novo.`);
  }
} finally {
  await client.end();
}
