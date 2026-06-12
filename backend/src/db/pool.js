import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL não definido — confira backend/.env');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] erro inesperado no pool de conexões:', err);
});

/** Helper fino para queries parametrizadas. */
export function query(text, params) {
  return pool.query(text, params);
}
