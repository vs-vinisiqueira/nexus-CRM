import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';
import { seedAdminIfEmpty } from '../services/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] aplicando schema...');
  await pool.query(sql);

  const admin = await seedAdminIfEmpty();
  if (admin) {
    console.log(
      `[migrate] usuário admin criado: "${admin.username}"` +
        (admin.usedDefaultPassword
          ? ' — senha padrão "admin". TROQUE definindo ADMIN_PASSWORD!'
          : '')
    );
  }

  console.log('[migrate] ok');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[migrate] falhou:', err);
  process.exit(1);
});
