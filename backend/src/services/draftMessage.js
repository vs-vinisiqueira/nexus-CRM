/**
 * Gera um RASCUNHO de mensagem de abordagem, personalizado por segmento e nome
 * do negócio. O resultado é entregue ao atendente humano para revisar e enviar
 * manualmente — o sistema nunca envia sozinho.
 *
 * Usa a API da Anthropic quando ANTHROPIC_API_KEY está presente; caso contrário,
 * cai num template determinístico.
 */

import { getSetting } from './settings.js';

function templateDraft({ name, segment }) {
  const seg = segment ? ` de ${segment.toLowerCase()}` : '';
  return (
    `Olá! Vi o${seg ? '' : ''} ${name}${seg} aqui em Guarulhos e achei o trabalho de vocês muito bacana. ` +
    `Reparei que ainda não encontrei um site próprio do negócio — hoje a maioria dos clientes ` +
    `pesquisa no Google antes de decidir, e um site simples costuma trazer mais contatos. ` +
    `Eu crio landing pages enxutas pra negócios locais como o de vocês. Posso te mostrar um exemplo rápido?`
  );
}

async function aiDraft({ name, segment }, apiKey) {
  // Import dinâmico: o SDK é dependência opcional.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const prompt =
    `Escreva uma única mensagem curta e natural de WhatsApp (PT-BR, no máximo 3 frases) ` +
    `para abordar um negócio local de Guarulhos chamado "${name}"` +
    (segment ? `, do segmento "${segment}"` : '') +
    `. Objetivo: oferecer a criação de uma landing page / site simples. ` +
    `Seja cordial, sem parecer spam, sem emojis em excesso, sem promessas exageradas. ` +
    `Responda apenas com o texto da mensagem, sem aspas.`;

  const msg = await client.messages.create({
    model,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content
    ?.filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return text || templateDraft({ name, segment });
}

/**
 * @param {{name: string, segment?: string}} lead
 * @returns {Promise<{draft: string, source: 'ai'|'template'}>}
 */
export async function draftMessageFor(lead) {
  const apiKey = await getSetting('ANTHROPIC_API_KEY');
  if (apiKey) {
    try {
      const draft = await aiDraft(lead, apiKey);
      return { draft, source: 'ai' };
    } catch (err) {
      console.warn('[draftMessage] IA falhou, usando template:', err.message);
    }
  }
  return { draft: templateDraft(lead), source: 'template' };
}
