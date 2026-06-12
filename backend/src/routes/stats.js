import { Router } from 'express';
import { query } from '../db/pool.js';

export const statsRouter = Router();

/** GET /api/stats — contagem por status + leads quentes (fila) e atividade do dia. */
statsRouter.get('/', async (_req, res, next) => {
  try {
    const [byStatus, hot, today, attendants] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS count FROM leads GROUP BY status`),
      query(
        `SELECT l.id, l.name, l.segment, l.phone, l.assigned_to, a.name AS attendant_name
           FROM leads l LEFT JOIN attendants a ON a.id = l.assigned_to
          WHERE l.status = 'respondeu'
          ORDER BY l.updated_at DESC LIMIT 100`
      ),
      query(
        `SELECT COUNT(*)::int AS count FROM activity_log
          WHERE type = 'collected' AND created_at >= date_trunc('day', now())`
      ),
      query(`SELECT COUNT(*)::int AS count FROM attendants WHERE active = TRUE`),
    ]);

    const counts = Object.fromEntries(byStatus.rows.map((r) => [r.status, r.count]));
    res.json({
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      hotLeads: hot.rows,
      collectedToday: today.rows[0].count,
      activeAttendants: attendants.rows[0].count,
    });
  } catch (err) {
    next(err);
  }
});
