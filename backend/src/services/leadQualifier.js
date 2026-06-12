/**
 * Qualificação de lead: dado um negócio (nome + cidade), descobre se ele já
 * possui um SITE PRÓPRIO. Se os únicos resultados forem redes sociais ou
 * agregadores (Google Maps, iFood, etc.), o negócio é um alvo válido — não tem
 * presença digital própria.
 *
 * Usa SerpAPI quando a chave está configurada (via UI ou .env). Sem a chave,
 * degrada para `hasWebsite: null` (confiança baixa) em vez de chutar.
 */
import { getSetting } from './settings.js';

// Domínios que NÃO contam como "site próprio" do negócio.
export const SOCIAL_AND_AGGREGATORS = [
  'instagram.com', 'facebook.com', 'fb.com', 'm.facebook.com',
  'linktr.ee', 'linktree.com', 'wa.me', 'api.whatsapp.com',
  'google.com', 'goo.gl', 'maps.google.com', 'business.google.com',
  'ifood.com.br', 'tripadvisor.com', 'tripadvisor.com.br',
  'youtube.com', 'tiktok.com', 'twitter.com', 'x.com',
  'doctoralia.com.br', 'getninjas.com.br', 'guiamais.com.br',
  'apontador.com.br', 'telelistas.net', 'solutudo.com.br',
  'yelp.com', 'foursquare.com', 'booking.com',
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Um link conta como "site próprio" se não for rede social nem agregador. */
export function isOwnSite(url) {
  const host = hostnameOf(url);
  if (!host) return false;
  return !SOCIAL_AND_AGGREGATORS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Resultados orgânicos do Google via SerpAPI. */
async function serpapiOrganic(queryText, apiKey) {
  const params = new URLSearchParams({
    engine: 'google',
    q: queryText,
    google_domain: 'google.com.br',
    gl: 'br',
    hl: 'pt-br',
    num: '10',
    api_key: apiKey,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`SerpAPI: ${data.error}`);
  return (data.organic_results || []).map((r) => r.link).filter(Boolean);
}

/**
 * @param {object} lead
 * @param {string} lead.name
 * @param {string} [lead.city]
 * @param {string} [lead.neighborhood]
 * @returns {Promise<{hasWebsite: boolean|null, websiteUrl: string|null, evidence: string[], confidence: 'high'|'low'}>}
 */
export async function qualifyLead({ name, city = 'Guarulhos', neighborhood }) {
  const apiKey = await getSetting('SERPAPI_KEY');
  if (!apiKey) {
    // Sem provedor de busca configurado: não dá para afirmar com confiança.
    return { hasWebsite: null, websiteUrl: null, evidence: [], confidence: 'low' };
  }

  const terms = [name, neighborhood, city].filter(Boolean).join(' ');
  const links = await serpapiOrganic(`${terms} site`, apiKey);

  const ownSites = links.filter(isOwnSite);
  const hasWebsite = ownSites.length > 0;

  return {
    hasWebsite,
    websiteUrl: hasWebsite ? ownSites[0] : null,
    evidence: links.slice(0, 5),
    confidence: 'high',
  };
}
