import { Router } from 'express';
import { query } from '../db/pool.js';

export const attendantsRouter = Router();

/** GET /api/attendants — inclui contagem de leads atribuídos em aberto. */
attendantsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*,
              COUNT(l.id) FILTER (
                WHERE l.status IN ('respondeu','contatado')
              ) AS open_leads
         FROM attendants a
         LEFT JOIN leads l ON l.assigned_to = a.id
        GROUP BY a.id
        ORDER BY a.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** POST /api/attendants */
attendantsRouter.post('/', async (req, res, next) => {
  try {
    const { name, whatsapp, active = true } = req.body;
    if (!name || !whatsapp) {
      return res.status(400).json({ error: 'name e whatsapp são obrigatórios' });
    }
    const { rows } = await query(
      `INSERT INTO attendants (name, whatsapp, active) VALUES ($1,$2,$3) RETURNING *`,
      [name, whatsapp, active]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/attendants/:id */
attendantsRouter.patch('/:id', async (req, res, next) => {
  try {
    const updates = {};
    for (const field of ['name', 'whatsapp', 'active']) {
      if (field in req.body) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'nenhum campo para atualizar' });
    }
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      params.push(v);
      sets.push(`${k} = $${params.length}`);
    }
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE attendants SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'atendente não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/attendants/:id */
attendantsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM attendants WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'atendente não encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
