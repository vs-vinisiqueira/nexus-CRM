import { pool } from '../db/pool.js';

/**
 * Seleciona o próximo atendente ativo por rodízio justo: quem ficou mais tempo
 * sem receber um lead vem primeiro (NULLS FIRST = nunca recebeu). A seleção e a
 * marcação de `last_assigned_at` acontecem na mesma transação, com
 * FOR UPDATE SKIP LOCKED, para que dois leads atribuídos em paralelo não caiam
 * no mesmo atendente.
 *
 * @returns {Promise<{id: string, name: string, whatsapp: string} | null>}
 */
export async function pickNextAttendant() {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const { rows } = await tx.query(
      `SELECT id, name, whatsapp
         FROM attendants
        WHERE active = TRUE
        ORDER BY last_assigned_at ASC NULLS FIRST, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`
    );
    if (rows.length === 0) {
      await tx.query('ROLLBACK');
      return null;
    }
    const attendant = rows[0];
    await tx.query(
      `UPDATE attendants SET last_assigned_at = now() WHERE id = $1`,
      [attendant.id]
    );
    await tx.query('COMMIT');
    return attendant;
  } catch (err) {
    await tx.query('ROLLBACK');
    throw err;
  } finally {
    tx.release();
  }
}
