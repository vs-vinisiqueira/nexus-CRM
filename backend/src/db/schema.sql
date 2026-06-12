-- Nexus schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Atendentes humanos que recebem os leads quentes
CREATE TABLE IF NOT EXISTS attendants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  whatsapp         TEXT NOT NULL,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_assigned_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status do pipeline
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM (
    'pendente',     -- coletado, ainda não qualificado
    'qualificado',  -- confirmado que NÃO tem site -> alvo válido
    'contatado',    -- abordagem feita por um humano
    'respondeu',    -- lead respondeu -> vira "quente"
    'convertido',   -- fechou
    'descartado'    -- tem site / fora do perfil / não interessado
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE lead_source AS ENUM (
    'google_maps', 'instagram', 'facebook', 'google_search', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  segment       TEXT,
  phone         TEXT,                      -- whatsapp / telefone
  source        lead_source NOT NULL DEFAULT 'manual',
  source_url    TEXT,
  city          TEXT NOT NULL DEFAULT 'Guarulhos',
  neighborhood  TEXT,
  has_website   BOOLEAN,                   -- null = ainda não verificado
  website_url   TEXT,
  status        lead_status NOT NULL DEFAULT 'pendente',
  assigned_to   UUID REFERENCES attendants(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evita lead duplicado pelo mesmo telefone (quando há telefone)
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_unique
  ON leads (phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_assigned_idx ON leads (assigned_to);

-- Histórico de conversa logado manualmente pelo atendente
CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_lead_idx ON messages (lead_id, created_at);

-- Trilha de auditoria
CREATE TABLE IF NOT EXISTS activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  attendant_id  UUID REFERENCES attendants(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_lead_idx ON activity_log (lead_id, created_at);

-- Usuários do dashboard (operadores/admin) e sessões de login.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- Configurações editáveis em runtime (ex.: chave da SerpAPI cadastrada pela UI).
-- Nota: para produção, considere cifrar valores sensíveis em repouso.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campos para o canal WhatsApp Cloud API (oficial).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_in_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ; -- abre a janela de 24h

ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id TEXT;     -- wamid da Meta
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT; -- sent/delivered/read/failed

CREATE INDEX IF NOT EXISTS messages_external_idx ON messages (external_id);
