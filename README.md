# Nexus

CRM de prospecção para venda de landing pages e sites a pequenos negócios locais de
Guarulhos/SP que ainda não têm presença digital própria.

## Escopo desta implementação

Este projeto foi construído de forma **compatível com os Termos de Uso do WhatsApp e com a
LGPD**. Isso muda uma decisão central de arquitetura em relação à ideia original:

- ✅ **Coleta de leads** — descobre negócios via Google Search e **confirma no Google Maps que
  não têm site próprio** (dado público de negócio, para qualificação interna). Via SerpAPI.
- ✅ **Qualificação** — verifica ativamente se um lead já tem site próprio.
- ✅ **CRM / pipeline** — `pendente → qualificado → contatado → respondeu → convertido / descartado`.
- ✅ **Gestão de atendentes** com fila/rodízio (round-robin) para distribuir leads quentes.
- ✅ **IA gera rascunhos** de mensagem personalizados por segmento — um humano revisa e envia.
- ✅ **Handoff humano** via link `wa.me` com o resumo da conversa.
- ✅ **Dashboard** React + Tailwind: visão geral, leads, coleta, atendentes e configurações.
- ✅ **WhatsApp Cloud API (oficial)** para conversas com leads que deram opt-in — envio com
  travas de conformidade (janela de 24h / template) e webhook de recebimento.
- ❌ **Não há** disparo automático em massa via Baileys nem camada "anti-banimento".

### Por que não há disparo automático

Disparar mensagens não solicitadas em massa por uma biblioteca não-oficial (Baileys), com
delays/limites desenhados para escapar da detecção de spam do WhatsApp, é (a) violação dos
Termos da Meta — que bane os números —, (b) spam, e (c) tratamento de dados pessoais sem base
legal sob a LGPD. A API oficial (WhatsApp Cloud API) também não permite cold outreach em massa
justamente por isso.

O caminho compatível, e que escala bem com bom tooling, é **humano dispara / sistema organiza**:
o vendedor humano aborda o negócio que o sistema qualificou, e a IA + o CRM potencializam isso.
Para conversas com quem deu opt-in, integra-se depois a WhatsApp Cloud API oficial.

## Stack

| Camada      | Tecnologia                |
| ----------- | ------------------------- |
| Backend     | Node.js + Express (ESM)   |
| Banco       | PostgreSQL 16 via Docker  |
| IA          | Anthropic Claude (opcional, com fallback por template) |
| Coleta      | SerpAPI — Google Search + Google Maps (chave cadastrável pela UI) |
| Frontend    | React + Vite + Tailwind   |

## Como rodar (stack completa)

Pré-requisitos: Docker Desktop e Node.js 18+.

```bash
# 1. Banco (Postgres em container, host na porta 5433)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env       # DATABASE_URL já aponta para localhost:5433
npm install
npm run migrate            # cria as tabelas
npm run dev                # API em http://localhost:3001
npm run smoke              # (opcional) smoke-test de ponta a ponta

# 3. Frontend (em outro terminal)
cd frontend
npm install
npm run dev                # dashboard em http://localhost:5173
```

> A porta do Postgres é **5433** (host) para evitar conflito com um Postgres nativo já
> instalado na 5432. O container expõe 5432 internamente.

As chaves de **SerpAPI** (coleta) e **Anthropic** (rascunhos com IA) podem ser cadastradas
depois, pela aba **Configurações** do dashboard — ficam salvas no banco. Sem a SerpAPI, a
coleta avisa que precisa da chave; sem a Anthropic, os rascunhos usam um template.

## Estrutura

```
docker-compose.yml         # Postgres 16 (host:5433 -> container:5432)
backend/
  src/
    server.js              # bootstrap do HTTP
    app.js                 # app Express + rotas
    db/{pool,schema.sql,migrate}
    routes/
      leads.js             # CRUD + transições + qualificação + rascunho + mensagens
      attendants.js        # CRUD de atendentes
      assignments.js       # rodízio / atribuição de leads quentes
      collect.js           # coleta Search -> confirmação Maps
      settings.js          # chaves de API cadastráveis pela UI
      stats.js             # métricas para a visão geral
    services/
      leadCollector.js     # descobre via Search, confirma sem-site no Maps
      leadQualifier.js     # checa se o negócio tem site
      roundRobin.js        # próximo atendente (FOR UPDATE SKIP LOCKED)
      draftMessage.js      # rascunho com IA (human-in-the-loop)
      settings.js          # leitura/escrita de config (DB -> env fallback)
      activity.js          # log de atividade
  scripts/smoke.mjs        # smoke-test de ponta a ponta da API
frontend/
  src/
    App.jsx                # layout + navegação + rotas
    api.js                 # cliente da API
    components/ui.jsx      # botões, cards, badges, etc.
    pages/
      Overview.jsx         # KPIs + fila de leads quentes
      Leads.jsx            # lista + detalhe (qualificar, rascunho, conversa, atribuir)
      Collect.jsx          # coleta de leads
      Attendants.jsx       # gestão de atendentes
      Settings.jsx         # cadastro das chaves de API
```

## API (resumo)

| Método | Rota | Função |
|---|---|---|
| GET | `/api/stats` | métricas da visão geral |
| GET/POST | `/api/leads` | listar / criar lead |
| GET/PATCH/DELETE | `/api/leads/:id` | detalhe / atualizar (status validado) / excluir |
| POST | `/api/leads/:id/qualify` | verifica se tem site próprio |
| POST | `/api/leads/:id/draft` | gera rascunho (não envia) |
| POST | `/api/leads/:id/messages` | registra mensagem (in/out) |
| POST | `/api/leads/:id/assign` | atribui por rodízio + briefing + link wa.me |
| GET/POST/PATCH/DELETE | `/api/attendants` | gestão de atendentes |
| POST | `/api/collect` | coleta Search→Maps (com `autoSave`) |
| GET | `/api/settings` | status das chaves (nunca expõe o valor) |
| PUT | `/api/settings/:key` | cadastra chaves de API |
| GET | `/api/webhook` | handshake de verificação da Meta |
| POST | `/api/webhook` | recebe mensagens e status da Cloud API |
| POST | `/api/leads/:id/opt-in` | registra/remove consentimento do lead |
| POST | `/api/leads/:id/whatsapp/send` | envia texto (janela 24h) ou template (opt-in) |

## WhatsApp Cloud API (oficial)

Canal opcional para conversar com leads que **deram opt-in** — não faz cold outreach em massa
(a Cloud API da Meta não permite). As regras da Meta são aplicadas no backend **antes** de
chamar a Graph API:

- **Texto livre** só dentro da **janela de 24h** (que abre quando o lead te manda mensagem);
- **Template aprovado** para iniciar/reabrir conversa, e somente com **opt-in** registrado.

Setup:

1. Crie uma WhatsApp Business Account (WABA) na Meta e obtenha **Access Token** e **Phone Number ID**.
2. Em **Configurações** do dashboard, cadastre `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` e um
   `WHATSAPP_VERIFY_TOKEN` (string à sua escolha).
3. No painel da Meta, configure o webhook apontando para `https://SEU_DOMINIO/api/webhook`
   usando o mesmo verify token. Em dev, exponha o `localhost:3001` com um túnel (ex.: ngrok).
4. Assine os campos `messages` no webhook.

O recebimento cai direto no histórico do lead, abre a janela de 24h e promove `contatado → respondeu`.

## Deploy (produção / VPS)

Em produção, a **API e a UI rodam no mesmo container**: o build do frontend é servido pelo
próprio Express (com fallback de SPA para o React Router). O `docker-compose.prod.yml` sobe o
app + Postgres, com o banco acessível apenas na rede interna.

```bash
# no servidor (com Docker instalado):
cp .env.prod.example .env        # ajuste POSTGRES_PASSWORD e, se quiser, as chaves
docker compose -f docker-compose.prod.yml up -d --build
```

- UI + API ficam em `http://SEU_IP:${APP_PORT}` (padrão `3001`).
- A migração do banco roda sozinha no start do container (idempotente).
- As chaves de API podem ficar no `.env` **ou** ser cadastradas pela aba **Configurações**.
- **Recomendado:** colocar um proxy reverso (nginx / Caddy / Traefik) na frente para HTTPS.
  Para a Cloud API, o webhook precisa de uma URL pública HTTPS apontando para `/api/webhook`.

Build da imagem (multi-stage, definida no `Dockerfile`):

1. `node:20-alpine` builda o frontend (`vite build` → `dist/`);
2. `node:20-alpine` instala só as deps de produção do backend e copia o `dist/` para
   `backend/public`, servido pelo Express.

> O `docker-compose.yml` (sem sufixo) continua sendo o de **desenvolvimento** — só o Postgres
> na porta 5433, com backend e frontend rodando no host via `npm run dev`.

### HTTPS automático (Caddy + Let's Encrypt)

Para expor com domínio e TLS, use o `docker-compose.caddy.yml`: ele sobe app + Postgres
(**sem portas no host**) + Caddy nas portas 80/443, que emite e renova o certificado sozinho.

```bash
cp .env.prod.example .env     # defina POSTGRES_PASSWORD e DOMAIN (TLS_EMAIL é opcional)
# aponte o DNS (A/AAAA) do domínio para o IP da VPS e então:
docker compose -f docker-compose.caddy.yml up -d --build
```

Pronto: `https://SEU_DOMINIO` serve UI + API com HTTPS, e o webhook da Cloud API fica em
`https://SEU_DOMINIO/api/webhook`.

## CI/CD (GitHub Actions)

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) roda a cada push na `main`:

1. **test** — sobe um Postgres, roda a migração + o smoke-test do backend (30 checagens) e o build do frontend;
2. **deploy** — se os testes passarem, conecta na VPS por SSH, faz `git pull` e `docker compose -f docker-compose.caddy.yml up -d --build`.

O deploy só executa quando os **secrets** abaixo existem (sem eles, o job é pulado sem erro):

| Secret | Descrição |
|---|---|
| `VPS_HOST` | IP ou host da VPS |
| `VPS_USER` | usuário SSH |
| `VPS_SSH_KEY` | conteúdo da chave **privada** SSH com acesso à VPS |
| `VPS_PORT` | porta SSH (opcional, padrão `22`) |
| `VPS_APP_DIR` | caminho do repositório clonado na VPS |

Setup único na VPS (Docker instalado):

```bash
git clone https://github.com/vs-vinisiqueira/nexus-CRM.git && cd nexus-CRM
cp .env.prod.example .env     # ajuste senha / domínio / chaves
# garanta que a chave pública correspondente a VPS_SSH_KEY esteja em ~/.ssh/authorized_keys
```

Cadastre os secrets em **Settings → Secrets and variables → Actions** no GitHub. A partir daí,
todo push na `main` testa e (com os secrets) faz deploy automático.
