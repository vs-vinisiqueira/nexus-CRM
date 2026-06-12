import { Router } from 'express';
import { query } from '../db/pool.js';
import { collectLeads } from '../services/leadCollector.js';
import { logActivity } from '../services/activity.js';

export const collectRouter = Router();

/**
 * POST /api/collect
 * body: { segment, neighborhood, city?, limit?, autoSave? }
 *
 * Descobre via Search + confirma sem-site no Maps. Com autoSave=true, grava os
 * leads válidos no pipeline já como 'qualificado' (Maps confirmou que não têm
 * site próprio). Retorna também os candidatos descartados e o motivo.
 */
collectRouter.post('/', async (req, res, next) => {
  try {
    const { segment, neighborhood, city = 'Guarulhos', limit = 20, autoSave = false } = req.body;
    if (!segment && !neighborhood) {
      return res.status(400).json({ error: 'informe ao menos segment ou neighborhood' });
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const result = await collectLeads({ segment, neighborhood, city, limit: safeLimit });

    if (!result.configured) {
      return res.status(200).json({
        configured: false,
        message: 'Chave da SerpAPI não configurada. Cadastre em Configurações para coletar.',
        discovered: 0,
        leads: [],
        skipped: [],
        saved: 0,
      });
    }

    let saved = 0;
    const savedLeads = [];
    if (autoSave) {
      for (const lead of result.leads) {
        const { rows } = await query(
          `INSERT INTO leads (name, segment, phone, source, source_url, city, neighborhood,
                              has_website, website_url, status)
           VALUES ($1,$2,$3,$4::lead_source,$5,$6,$7,FALSE,NULL,'qualificado')
           ON CONFLICT (phone) WHERE phone IS NOT NULL DO NOTHING
           RETURNING *`,
          [lead.name, lead.segment, lead.phone, lead.source, lead.source_url, lead.city, lead.neighborhood]
        );
        if (rows.length) {
          saved += 1;
          savedLeads.push(rows[0]);
          await logActivity({
            leadId: rows[0].id,
            type: 'collected',
            detail: { source: lead.source, maps_found: lead.maps_found, address: lead.address },
          });
        }
      }
    }

    res.json({ ...result, saved, savedLeads });
  } catch (err) {
    next(err);
  }
});
