/**
 * Integração com a WhatsApp Cloud API (oficial, da Meta).
 *
 * Envia mensagens pela Graph API. As credenciais são lidas via settings
 * (cadastráveis pela UI). NÃO faz cold outreach: o envio é guardado por regras
 * de conformidade nas rotas — texto livre só dentro da janela de 24h, e template
 * (que inicia conversa) só com opt-in do lead.
 */
import { getSetting } from './settings.js';
import { normalizePhoneBR } from '../utils/whatsapp.js';

const GRAPH_VERSION = 'v21.0';
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Credenciais atuais + flag de configurado. */
export async function cloudConfig() {
  const [token, phoneId] = await Promise.all([
    getSetting('WHATSAPP_TOKEN'),
    getSetting('WHATSAPP_PHONE_ID'),
  ]);
  return { token, phoneId, configured: Boolean(token && phoneId) };
}

/** A janela de atendimento de 24h abre quando o lead nos manda mensagem. */
export function isWindowOpen(lastInboundAt) {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

async function graphSend(payload) {
  const { token, phoneId, configured } = await cloudConfig();
  if (!configured) throw new Error('WhatsApp Cloud API não configurada');

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Graph API ${res.status}`);
  return data?.messages?.[0]?.id || null;
}

/** Texto livre — válido apenas dentro da janela de 24h (validado na rota). */
export async function sendText(toPhone, body) {
  const to = normalizePhoneBR(toPhone);
  if (!to) throw new Error('telefone inválido');
  return graphSend({ to, type: 'text', text: { preview_url: false, body } });
}

/** Template aprovado — necessário para iniciar conversa / fora da janela. */
export async function sendTemplate(toPhone, { name, language = 'pt_BR', components = [] }) {
  const to = normalizePhoneBR(toPhone);
  if (!to) throw new Error('telefone inválido');
  return graphSend({
    to,
    type: 'template',
    template: { name, language: { code: language }, components },
  });
}
