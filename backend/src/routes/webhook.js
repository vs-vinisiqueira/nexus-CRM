import crypto from 'node:crypto';
import { Router } from 'express';
import { query } from '../db/pool.js';
import { getSetting } from '../services/settings.js';
import { logActivity } from '../services/activity.js';
import { normalizePhoneBR } from '../utils/whatsapp.js';

export const webhookRouter = Router();

/**
 * Valida o cabeçalho X-Hub-Signature-256 que a Meta assina com o App Secret
 * sobre os bytes crus do corpo. Comparação em tempo constante.
 */
export function verifyMetaSignature(req, appSecret) {
  const header = req.get('x-hub-signature-256') || '';
  if (!header.startsWith('sha256=')) return false;
  const raw = req.rawBody;
  if (!raw || !raw.length) return false;
  const provided = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = crypto.createHmac('sha256', appSecret).update(raw).digest();
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/**
 * GET /api/webhook — handshake de verificação da Meta.
 * A Meta chama com hub.mode=subscribe e o hub.verify_token que você configurou;
 * devolvemos o hub.challenge se o token bater.
 */
webhookRouter.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = await getSetting('WHATSAPP_VERIFY_TOKEN');

  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(String(challenge ?? ''));
  }
  return res.sendStatus(403);
});

/** Encontra o lead pelo telefone do WhatsApp (compara forma normalizada). */
async function findLeadByPhone(waPhone) {
  const normalized = normalizePhoneBR(waPhone);
  if (!normalized) return null;
  const last8 = normalized.slice(-8);
  const { rows } = await query(
    `SELECT id, phone, status FROM leads WHERE phone IS NOT NULL AND phone LIKE '%' || $1`,
    [last8]
  );
  return rows.find((r) => normalizePhoneBR(r.phone) === normalized) || null;
}

async function processEvents(payload) {
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      // Mensagens recebidas do lead.
      for (const msg of value.messages || []) {
        const lead = await findLeadByPhone(msg.from);
        if (!lead) continue;

        const body = msg.text?.body || `[${msg.type || 'mensagem'}]`;
        await query(
          `INSERT INTO messages (lead_id, direction, body, channel, external_id)
           VALUES ($1, 'in', $2, 'whatsapp_cloud', $3)`,
          [lead.id, body, msg.id || null]
        );
        await query(
          `UPDATE leads SET last_inbound_at = now(), updated_at = now() WHERE id = $1`,
          [lead.id]
        );

        // Resposta do lead promove 'contatado' -> 'respondeu'.
        if (lead.status === 'contatado') {
          await query(`UPDATE leads SET status = 'respondeu' WHERE id = $1`, [lead.id]);
          await logActivity({
            leadId: lead.id,
            type: 'status_change',
            detail: { from: 'contatado', to: 'respondeu', reason: 'inbound whatsapp' },
          });
        }
      }

      // Atualizações de status de entrega das mensagens enviadas.
      for (const st of value.statuses || []) {
        if (st.id) {
          await query(`UPDATE messages SET delivery_status = $1 WHERE external_id = $2`, [
            st.status,
            st.id,
          ]);
        }
      }
    }
  }
}

/**
 * POST /api/webhook — eventos da Meta. Processamos e sempre respondemos 200
 * (a Meta reenvia em caso de erro/timeout).
 */
webhookRouter.post('/', async (req, res) => {
  // Rota pública (a Meta não envia Bearer): a autenticidade vem da assinatura HMAC.
  const appSecret = await getSetting('WHATSAPP_APP_SECRET');
  if (appSecret) {
    if (!verifyMetaSignature(req, appSecret)) {
      console.warn('[webhook] assinatura inválida — payload rejeitado');
      return res.sendStatus(403);
    }
  } else {
    console.warn(
      '[webhook] WHATSAPP_APP_SECRET não configurado — recebendo sem validar assinatura'
    );
  }

  try {
    await processEvents(req.body);
  } catch (err) {
    console.error('[webhook] erro ao processar:', err);
  }
  res.sendStatus(200);
});
