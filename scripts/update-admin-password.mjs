import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// Uso: node scripts/update-admin-password.mjs [novaSenha] [email]
// Se a senha for omitida, uma senha aleatória é gerada (nunca usa um valor fixo).
function gerarSenha() {
  return randomBytes(12).toString('base64url');
}

const NEW_PASSWORD = process.argv[2] || gerarSenha();
const EMAIL = process.argv[3] || process.env.DEMO_ADMIN_EMAIL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrado no .env.');
  process.exit(1);
}
if (!EMAIL) {
  console.error('Informe o e-mail do admin (ou defina DEMO_ADMIN_EMAIL no .env).');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const hash = await bcrypt.hash(NEW_PASSWORD, 12);
  const result = await pool.query(
    'UPDATE admins SET password_hash = $1, updated_at = now() WHERE email = $2 RETURNING id, email',
    [hash, EMAIL]
  );
  if (result.rowCount === 0) {
    console.error(`Nenhum admin encontrado com o e-mail ${EMAIL}.`);
    process.exit(1);
  }
  console.log(`✅ Senha atualizada para ${result.rows[0].email}. Nova senha: ${NEW_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao atualizar a senha:', err);
  process.exit(1);
});
