import { query } from '../db/pool.js';

/**
 * Configurações em runtime. A leitura prioriza o valor salvo no banco (cadastrado
 * pela UI) e, na ausência, cai para a variável de ambiente de mesmo nome.
 *
 * Assim o usuário pode "colocar a chave depois" pela interface, sem reiniciar o
 * servidor, e ainda funciona via .env quando preferir.
 */

const ENV_FALLBACK = {
  SERPAPI_KEY: () => process.env.SERPAPI_KEY,
  ANTHROPIC_API_KEY: () => process.env.ANTHROPIC_API_KEY,
  WHATSAPP_TOKEN: () => process.env.WHATSAPP_TOKEN,
  WHATSAPP_PHONE_ID: () => process.env.WHATSAPP_PHONE_ID,
  WHATSAPP_VERIFY_TOKEN: () => process.env.WHATSAPP_VERIFY_TOKEN,
};

/** @returns {Promise<string|null>} */
export async function getSetting(key) {
  try {
    const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length && rows[0].value) return rows[0].value;
  } catch (err) {
    console.warn('[settings] leitura no banco falhou, usando env:', err.message);
  }
  const fallback = ENV_FALLBACK[key];
  return fallback ? fallback() || null : null;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
}

/** Lista as chaves conhecidas indicando se estão configuradas (sem expor o valor). */
export async function settingsStatus() {
  const status = {};
  for (const key of Object.keys(ENV_FALLBACK)) {
    let source = null;
    try {
      const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
      if (rows.length && rows[0].value) source = 'db';
    } catch {
      /* banco indisponível — checa apenas o env abaixo */
    }
    if (!source && process.env[key]) source = 'env';
    status[key] = { configured: Boolean(source), source };
  }
  return status;
}
