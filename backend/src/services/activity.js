import { query } from '../db/pool.js';

/**
 * Registra um evento na trilha de auditoria.
 * @param {object} e
 * @param {string|null} e.leadId
 * @param {string|null} [e.attendantId]
 * @param {string} e.type
 * @param {object} [e.detail]
 */
export async function logActivity({ leadId, attendantId = null, type, detail = {} }) {
  await query(
    `INSERT INTO activity_log (lead_id, attendant_id, type, detail)
     VALUES ($1, $2, $3, $4)`,
    [leadId, attendantId, type, detail]
  );
}
