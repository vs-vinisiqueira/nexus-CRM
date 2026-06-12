import { Router } from 'express';
import { query } from '../db/pool.js';
import { logActivity } from '../services/activity.js';
import { cloudConfig, isWindowOpen, sendText, sendTemplate } from '../services/whatsappCloud.js';

export const whatsappRouter = Router();

/**
 * POST /api/leads/:id/opt-in  { opted?: boolean }
 * Registra (ou remove) o consentimento do lead para receber mensagens.
 */
whatsappRouter.post('/leads/:id/opt-in', async (req, res, next) => {
  try {
    const opted = req.body?.opted !== false; // default true
    const { rows } = await query(
      `UPDATE leads
          SET opt_in = $1,
              opt_in_at = CASE WHEN $1 THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $2
      RETURNING *`,
      [opted, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'lead não encontrado' });
    await logActivity({ leadId: req.params.id, type: 'opt_in', detail: { opted } });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/leads/:id/whatsapp/send
 *   { text }                       -> texto livre (só dentro da janela de 24h)
 *   { template: { name, language, components } } -> template (exige opt-in)
 *
 * As regras da Meta são aplicadas ANTES de chamar a Graph API.
 */
whatsappRouter.post('/leads/:id/whatsapp/send', async (req, res, next) => {
  try {
    const cfg = await cloudConfig();
    if (!cfg.configured) {
      return res.status(409).json({ error: 'WhatsApp Cloud API não configurada' });
    }

    const { rows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'lead não encontrado' });
    const lead = rows[0];
    if (!lead.phone) return res.status(400).json({ error: 'lead sem telefone' });

    const { text, template } = req.body || {};

    // --- Travas de conformidade ---
    if (template?.name) {
      if (!lead.opt_in) {
        return res.status(409).json({ error: 'envio de template requer opt-in do lead' });
      }
    } else if (text) {
      if (!isWindowOpen(lead.last_inbound_at)) {
        return res.status(409).json({
          error: 'janela de 24h fechada — use um template aprovado para iniciar/reabrir a conversa',
        });
      }
    } else {
      return res.status(400).json({ error: 'informe text ou template' });
    }

    // --- Envio ---
    let externalId;
    let body;
    try {
      if (template?.name) {
        externalId = await sendTemplate(lead.phone, template);
        body = `[template: ${template.name}]`;
      } else {
        externalId = await sendText(lead.phone, text);
        body = text;
      }
    } catch (err) {
      return res.status(502).json({ error: `falha no envio: ${err.message}` });
    }

    await query(
      `INSERT INTO messages (lead_id, direction, body, channel, external_id, delivery_status)
       VALUES ($1, 'out', $2, 'whatsapp_cloud', $3, 'sent')`,
      [lead.id, body, externalId]
    );
    await logActivity({
      leadId: lead.id,
      type: 'whatsapp_sent',
      detail: { kind: template?.name ? 'template' : 'text', externalId },
    });

    res.status(201).json({ externalId, body });
  } catch (err) {
    next(err);
  }
});
