import { Router } from 'express';
import { query } from '../db/pool.js';
import { pickNextAttendant } from '../services/roundRobin.js';
import { logActivity } from '../services/activity.js';
import { buildWaMeLink } from '../utils/whatsapp.js';

export const assignmentsRouter = Router();

/**
 * Monta o briefing que o atendente recebe ao assumir um lead quente:
 * dados do lead, histórico recente e o link direto para falar com o lead.
 */
function buildBriefing(lead, messages) {
  const history = messages
    .map((m) => `${m.direction === 'in' ? 'Lead' : 'Nós'}: ${m.body}`)
    .join('\n');

  const leadLink = buildWaMeLink(lead.phone);

  const lines = [
    `🔥 Lead quente: ${lead.name}`,
    lead.segment ? `Segmento: ${lead.segment}` : null,
    lead.neighborhood ? `Bairro: ${lead.neighborhood} — ${lead.city}` : `Cidade: ${lead.city}`,
    lead.phone ? `Telefone: ${lead.phone}` : 'Sem telefone cadastrado',
    history ? `\nHistórico:\n${history}` : '\n(sem histórico registrado)',
    leadLink ? `\nFalar com o lead: ${leadLink}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * POST /api/leads/:id/assign
 * Atribui o lead ao próximo atendente do rodízio e devolve o briefing + links.
 * Opcional no corpo: { attendantId } para atribuição manual a um atendente específico.
 */
assignmentsRouter.post('/leads/:id/assign', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'lead não encontrado' });
    const lead = rows[0];

    let attendant;
    if (req.body?.attendantId) {
      const a = await query(
        'SELECT id, name, whatsapp FROM attendants WHERE id = $1 AND active = TRUE',
        [req.body.attendantId]
      );
      if (a.rows.length === 0) {
        return res.status(404).json({ error: 'atendente não encontrado ou inativo' });
      }
      attendant = a.rows[0];
      await query('UPDATE attendants SET last_assigned_at = now() WHERE id = $1', [attendant.id]);
    } else {
      attendant = await pickNextAttendant();
      if (!attendant) {
        return res.status(409).json({ error: 'nenhum atendente ativo disponível' });
      }
    }

    await query('UPDATE leads SET assigned_to = $1, updated_at = now() WHERE id = $2', [
      attendant.id,
      lead.id,
    ]);

    const { rows: messages } = await query(
      'SELECT direction, body FROM messages WHERE lead_id = $1 ORDER BY created_at ASC',
      [lead.id]
    );

    const briefing = buildBriefing(lead, messages);
    // Link wa.me para "notificar" o atendente: abre o WhatsApp do próprio atendente
    // com o briefing pré-preenchido para ele encaminhar/registrar.
    const notifyLink = buildWaMeLink(attendant.whatsapp, briefing);
    const leadContactLink = buildWaMeLink(lead.phone);

    await logActivity({
      leadId: lead.id,
      attendantId: attendant.id,
      type: 'assigned',
      detail: { attendant: attendant.name },
    });

    res.json({
      attendant: { id: attendant.id, name: attendant.name },
      briefing,
      notifyLink,
      leadContactLink,
    });
  } catch (err) {
    next(err);
  }
});
