import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leadsRouter } from './routes/leads.js';
import { attendantsRouter } from './routes/attendants.js';
import { assignmentsRouter } from './routes/assignments.js';
import { collectRouter } from './routes/collect.js';
import { settingsRouter } from './routes/settings.js';
import { statsRouter } from './routes/stats.js';
import { webhookRouter } from './routes/webhook.js';
import { whatsappRouter } from './routes/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/leads', leadsRouter);
  app.use('/api/attendants', attendantsRouter);
  app.use('/api/collect', collectRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/webhook', webhookRouter); // Cloud API: verificação + recebimento
  app.use('/api', assignmentsRouter); // expõe /api/leads/:id/assign
  app.use('/api', whatsappRouter); // opt-in + envio via Cloud API

  // --- Frontend buildado (produção / container único) ---
  // Em dev o Vite serve a UI; aqui o Express serve o dist quando ele existe.
  const staticDir = process.env.STATIC_DIR || path.resolve(__dirname, '..', 'public');
  const indexHtml = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(staticDir));
    // SPA fallback: navegação (GET fora de /api) devolve index.html para o React Router.
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api/') || req.path === '/health') return next();
      res.sendFile(indexHtml);
    });
  }

  // 404 (rotas de API não encontradas, ou quando não há build estático)
  app.use((req, res) => res.status(404).json({ error: 'rota não encontrada' }));

  // Tratamento de erros centralizado
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[erro]', err);
    res.status(500).json({ error: 'erro interno', detail: err.message });
  });

  return app;
}
