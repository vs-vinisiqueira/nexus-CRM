/**
 * Coleta de leads em dois passos, como solicitado:
 *
 *   1. DESCOBRIR via Google Search (engine=google): encontra negócios do
 *      segmento na região (ex.: "salão de beleza Vila Galvão Guarulhos").
 *   2. CONFIRMAR via Google Maps (engine=google_maps): para cada candidato,
 *      consulta o registro do Maps e verifica o campo `website`. Se não houver
 *      site próprio, é um lead válido (sem presença digital própria).
 *
 * Tudo via SerpAPI, que é a forma compatível de consultar Google/Maps (em vez de
 * raspar as páginas diretamente, o que violaria os termos do Google). A chave é
 * lida via settings (cadastrável pela UI) — sem chave, retorna erro amigável.
 *
 * IMPORTANTE: isto coleta dado público de NEGÓCIO para qualificação interna do
 * pipeline. Não dispara mensagens — quem aborda é o atendente humano.
 */
import { getSetting } from './settings.js';
import { isOwnSite } from './leadQualifier.js';

const SERPAPI = 'https://serpapi.com/search.json';

async function serpapi(params, apiKey) {
  const qs = new URLSearchParams({
    google_domain: 'google.com.br',
    gl: 'br',
    hl: 'pt-br',
    ...params,
    api_key: apiKey,
  });
  const res = await fetch(`${SERPAPI}?${qs}`);
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`SerpAPI: ${data.error}`);
  return data;
}

/** Normaliza os resultados locais do Maps (a forma varia entre versões da API). */
function mapsLocalResults(data) {
  if (Array.isArray(data.local_results)) return data.local_results;
  if (Array.isArray(data.local_results?.places)) return data.local_results.places;
  if (data.place_results) return [data.place_results];
  return [];
}

/** Passo 1 — descobre candidatos via Search. */
async function discoverViaSearch({ segment, neighborhood, city, apiKey, limit }) {
  const q = [segment, neighborhood, city].filter(Boolean).join(' ');
  const data = await serpapi({ engine: 'google', q, num: '20' }, apiKey);

  const candidates = [];
  const seen = new Set();
  const push = (name, sourceUrl) => {
    const key = name?.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ name: name.trim(), source: 'google_search', source_url: sourceUrl || null });
  };

  // Pacote local (map pack) costuma trazer os negócios mais relevantes.
  const local = data.local_results?.places || data.local_results || [];
  for (const place of Array.isArray(local) ? local : []) {
    push(place.title, place.links?.website);
  }
  // Complementa com resultados orgânicos.
  for (const r of data.organic_results || []) {
    push(r.title, r.link);
  }

  return candidates.slice(0, limit);
}

/** Passo 2 — confirma no Maps se o candidato tem site próprio. */
async function confirmViaMaps({ name, city, apiKey }) {
  const data = await serpapi(
    { engine: 'google_maps', type: 'search', q: `${name} ${city}` },
    apiKey
  );
  const results = mapsLocalResults(data);
  if (results.length === 0) {
    return { found: false, hasWebsite: null, websiteUrl: null, phone: null, address: null };
  }

  // Melhor correspondência: o primeiro resultado costuma ser o mais próximo.
  const best = results[0];
  const website = best.website || null;
  // Um "site" que é rede social/agregador NÃO conta como site próprio.
  const hasOwnSite = website ? isOwnSite(website) : false;

  return {
    found: true,
    hasWebsite: hasOwnSite,
    websiteUrl: hasOwnSite ? website : null,
    phone: best.phone || null,
    address: best.address || null,
  };
}

/**
 * Fluxo completo: descobre e devolve apenas os candidatos SEM site próprio
 * (leads válidos), já enriquecidos com telefone/endereço do Maps.
 *
 * @returns {Promise<{
 *   configured: boolean,
 *   discovered: number,
 *   leads: Array<object>,
 *   skipped: Array<{name: string, reason: string, websiteUrl?: string}>,
 * }>}
 */
export async function collectLeads({ segment, neighborhood, city = 'Guarulhos', limit = 20 }) {
  const apiKey = await getSetting('SERPAPI_KEY');
  if (!apiKey) {
    return { configured: false, discovered: 0, leads: [], skipped: [] };
  }

  const candidates = await discoverViaSearch({ segment, neighborhood, city, apiKey, limit });

  const leads = [];
  const skipped = [];
  for (const c of candidates) {
    let confirmation;
    try {
      confirmation = await confirmViaMaps({ name: c.name, city, apiKey });
    } catch (err) {
      skipped.push({ name: c.name, reason: `falha no Maps: ${err.message}` });
      continue;
    }

    if (confirmation.hasWebsite) {
      skipped.push({ name: c.name, reason: 'já tem site próprio', websiteUrl: confirmation.websiteUrl });
      continue;
    }

    leads.push({
      name: c.name,
      segment: segment || null,
      phone: confirmation.phone,
      source: c.source,
      source_url: c.source_url,
      city,
      neighborhood: neighborhood || null,
      has_website: false,
      website_url: null,
      maps_found: confirmation.found,
      address: confirmation.address,
    });
  }

  return { configured: true, discovered: candidates.length, leads, skipped };
}
