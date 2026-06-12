import { Router } from 'express';
import { setSetting, settingsStatus } from '../services/settings.js';

export const settingsRouter = Router();

// Chaves que a UI pode cadastrar.
const EDITABLE_KEYS = [
  'SERPAPI_KEY',
  'ANTHROPIC_API_KEY',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_ID',
  'WHATSAPP_VERIFY_TOKEN',
];

/** GET /api/settings — status (configurado / fonte), nunca expõe o valor. */
settingsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await settingsStatus());
  } catch (err) {
    next(err);
  }
});

/** PUT /api/settings/:key — define uma chave. Valor vazio remove o override. */
settingsRouter.put('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!EDITABLE_KEYS.includes(key)) {
      return res.status(400).json({ error: 'chave não editável', editable: EDITABLE_KEYS });
    }
    const value = (req.body?.value ?? '').toString().trim();
    await setSetting(key, value || null);
    const status = await settingsStatus();
    res.json({ key, ...status[key] });
  } catch (err) {
    next(err);
  }
});
