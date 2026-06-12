import { Router } from 'express';
import { query } from '../db/pool.js';
import { logActivity } from '../services/activity.js';
import { qualifyLead } from '../services/leadQualifier.js';
import { draftMessageFor } from '../services/draftMessage.js';

export const leadsRouter = Router();

const VALID_STATUS = [
  'pendente', 'qualificado', 'contatado', 'respondeu', 'convertido', 'descartado',
];
const VALID_SOURCE = [
  'google_maps', 'instagram', 'facebook', 'google_search', 'manual',
];

// Transições de status permitidas no pipeline.
const TRANSITIONS = {
  pendente: ['qualificado', 'descartado'],
  qualificado: ['contatado', 'descartado'],
  contatado: ['respondeu', 'descartado'],
  respondeu: ['convertido', 'descartado'],
  convertido: [],
  descartado: ['pendente'], // permite reabrir
};

/** GET /api/leads?status=&assigned_to=&q= */
leadsRouter.get('/', async (req, res, next) => {
  try {
    const { status, assigned_to, q } = req.query;
    const where = [];
    const params = [];

    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (assigned_to) {
      params.push(assigned_to);
      where.push(`assigned_to = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(name ILIKE $${params.length} OR segment ILIKE $${params.length})`);
    }

    const sql =
      `SELECT * FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ` +
      `ORDER BY updated_at DESC LIMIT 500`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** GET /api/leads/:id — inclui mensagens e atividade. */
leadsRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'lead não encontrado' });

    const [messages, activity] = await Promise.all([
      query('SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC', [req.params.id]),
      query('SELECT * FROM activity_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]),
    ]);

    res.json({ ...rows[0], messages: messages.rows, activity: activity.rows });
  } catch (err) {
    next(err);
  }
});

/** POST /api/leads */
leadsRouter.post('/', async (req, res, next) => {
  try {
    const { name, segment, phone, source, source_url, city, neighborhood, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    if (source && !VALID_SOURCE.includes(source)) {
      return res.status(400).json({ error: 'source inválido' });
    }

    const { rows } = await query(
      `INSERT INTO leads (name, segment, phone, source, source_url, city, neighborhood, notes)
       VALUES ($1,$2,$3,COALESCE($4,'manual')::lead_source,$5,COALESCE($6,'Guarulhos'),$7,$8)
       ON CONFLICT (phone) WHERE phone IS NOT NULL DO NOTHING
       RETURNING *`,
      [name, segment, phone, source, source_url, city, neighborhood, notes]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: 'já existe um lead com esse telefone' });
    }

    await logActivity({ leadId: rows[0].id, type: 'created', detail: { source: rows[0].source } });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/leads/:id — campos editáveis + transição de status validada. */
leadsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'lead não encontrado' });
    const lead = existing[0];

    const updates = {};
    const editable = ['name', 'segment', 'phone', 'source_url', 'city', 'neighborhood', 'notes'];
    for (const field of editable) {
      if (field in req.body) updates[field] = req.body[field];
    }

    if ('status' in req.body) {
      const next = req.body.status;
      if (!VALID_STATUS.includes(next)) {
        return res.status(400).json({ error: 'status inválido' });
      }
      if (next !== lead.status && !TRANSITIONS[lead.status].includes(next)) {
        return res.status(409).json({
          error: `transição inválida: ${lead.status} -> ${next}`,
          allowed: TRANSITIONS[lead.status],
        });
      }
      updates.status = next;
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
      `UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (updates.status && updates.status !== lead.status) {
      await logActivity({
        leadId: lead.id,
        type: 'status_change',
        detail: { from: lead.status, to: updates.status },
      });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/leads/:id */
leadsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM leads WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'lead não encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** POST /api/leads/:id/qualify — verifica se o negócio já tem site. */
leadsRouter.post('/:id/qualify', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'lead não encontrado' });
    const lead = rows[0];

    const result = await qualifyLead({
      name: lead.name,
      city: lead.city,
      neighborhood: lead.neighborhood,
    });

    // Só promove a 'qualificado' (alvo válido) quando temos confiança de que NÃO tem site.
    let nextStatus = lead.status;
    if (result.confidence === 'high' && lead.status === 'pendente') {
      nextStatus = result.hasWebsite ? 'descartado' : 'qualificado';
    }

    const { rows: updated } = await query(
      `UPDATE leads
          SET has_website = $1, website_url = $2, status = $3, updated_at = now()
        WHERE id = $4 RETURNING *`,
      [result.hasWebsite, result.websiteUrl, nextStatus, lead.id]
    );

    await logActivity({
      leadId: lead.id,
      type: 'qualified',
      detail: { ...result, nextStatus },
    });

    res.json({ lead: updated[0], qualification: result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/leads/:id/draft — gera rascunho de mensagem (não envia). */
leadsRouter.post('/:id/draft', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT name, segment FROM leads WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'lead não encontrado' });
    const result = await draftMessageFor(rows[0]);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/leads/:id/messages — registra uma mensagem trocada (log manual). */
leadsRouter.post('/:id/messages', async (req, res, next) => {
  try {
    const { direction, body } = req.body;
    if (!['out', 'in'].includes(direction)) {
      return res.status(400).json({ error: "direction deve ser 'out' ou 'in'" });
    }
    if (!body) return res.status(400).json({ error: 'body é obrigatório' });

    const { rows: leadRows } = await query('SELECT status FROM leads WHERE id = $1', [req.params.id]);
    if (leadRows.length === 0) return res.status(404).json({ error: 'lead não encontrado' });

    const { rows } = await query(
      `INSERT INTO messages (lead_id, direction, body) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, direction, body]
    );

    // Heurística: registrar uma mensagem 'in' (resposta do lead) sugere status 'respondeu'.
    if (direction === 'in' && leadRows[0].status === 'contatado') {
      await query(
        `UPDATE leads SET status = 'respondeu', updated_at = now() WHERE id = $1`,
        [req.params.id]
      );
      await logActivity({
        leadId: req.params.id,
        type: 'status_change',
        detail: { from: 'contatado', to: 'respondeu', reason: 'resposta registrada' },
      });
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});
