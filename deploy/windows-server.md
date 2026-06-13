# Deploy no servidor Windows (Docker Desktop) — sempre no ar, acesso por IP:porta

Cenário desta página: uma máquina **Windows com Docker Desktop** servindo o Nexus em
`http://IP_DO_SERVIDOR:3001` (UI + API no mesmo container, Postgres na rede interna).
Usa o **`docker-compose.prod.yml`**.

> Se mais tarde você apontar um domínio para o servidor, dá pra trocar para HTTPS automático
> com o `docker-compose.caddy.yml` (veja a seção "HTTPS" no [README](../README.md)).

---

## 1. Instalar uma vez

- **Docker Desktop** (com backend **WSL2**) — https://www.docker.com/products/docker-desktop
- **Git for Windows** — https://git-scm.com/download/win

Abra o Docker Desktop pelo menos uma vez e espere ele ficar **"Running"**.

## 2. Clonar e configurar

```powershell
cd C:\
git clone https://github.com/vs-vinisiqueira/nexus-CRM.git
cd nexus-CRM
Copy-Item .env.prod.example .env
notepad .env
```

No `.env`, **troque as senhas** (não suba o servidor com as padrão):

```ini
POSTGRES_PASSWORD=use-uma-senha-forte
ADMIN_PASSWORD=use-uma-senha-forte     # senha do login do dashboard (usuario padrao: admin)
APP_PORT=3001                          # porta publica
```

As chaves (SerpAPI, Anthropic, WhatsApp) podem ficar em branco e ser cadastradas depois pela
aba **Configurações** do dashboard.

## 3. Subir

Com o Docker Desktop **Running**:

```powershell
.\deploy\deploy.ps1 -Firewall
```

O `-Firewall` cria a regra de entrada para a porta 3001 (precisa de PowerShell **como
Administrador**; sem isso o app funciona em `localhost` mas não é acessível por outras máquinas).

Pronto — a UI + API ficam em:
- `http://localhost:3001` (na própria máquina)
- `http://IP_DO_SERVIDOR:3001` (na rede)

O script faz `git pull` + `build` + `up -d`. A migração do banco roda sozinha no start.

## 4. Sempre no ar — sobreviver a reboot / queda de energia

No Windows com Docker Desktop, o ponto crítico é: **o Docker só sobe quando há um usuário
logado**. Os containers já estão com `restart: unless-stopped` (voltam sozinhos quando o Docker
fica pronto), então falta garantir que o Docker suba após um reboot:

**a) Docker Desktop inicia no login**
Docker Desktop → ⚙️ **Settings → General** → marque **"Start Docker Desktop when you sign in"**.

**b) Windows faz login automático** (para o reboot não parar na tela de senha)
Pressione `Win+R`, digite `netplwiz`, Enter → desmarque **"Os usuários precisam digitar um nome
de usuário e senha para usar este computador"** → OK → informe a senha da conta.

Com (a) + (b): liga a máquina → Windows loga sozinho → Docker Desktop sobe → containers
`unless-stopped` voltam ao ar. Sem intervenção.

> **Aviso honesto:** essa é a forma prática de "sempre no ar" no Windows + Docker Desktop, mas
> ela depende de uma sessão de usuário ativa. Para um servidor 24/7 mais robusto (sem depender
> de login gráfico), o ideal é **Linux + Docker Engine** ou **Docker Engine no WSL2**. Funciona
> bem assim — só fica o registro do trade-off.

Dica extra: nas configurações de energia do Windows, desative suspensão/hibernação
(`Configurações → Sistema → Energia → Tela e suspensão: Nunca`) para a máquina não dormir.

## 5. Atualizar para uma nova versão

Sempre que houver novidade na `main` do GitHub:

```powershell
cd C:\nexus-CRM
.\deploy\deploy.ps1
```

(`git pull` + rebuild + `up -d`, sem downtime perceptível além do restart do container.)

## 6. Verificar e diagnosticar

```powershell
docker compose -f docker-compose.prod.yml ps              # status dos containers
docker compose -f docker-compose.prod.yml logs -f app     # logs do app (Ctrl+C sai)
Invoke-WebRequest http://localhost:3001/health -UseBasicParsing   # healthcheck
```

## 7. Parar / reiniciar

```powershell
docker compose -f docker-compose.prod.yml restart         # reinicia
docker compose -f docker-compose.prod.yml down            # para tudo (dados do banco ficam no volume)
```

Os dados do Postgres ficam no volume `nexus_pgdata` e **não** se perdem num `down`/rebuild.

## 8. Backup do banco (recomendado)

```powershell
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres nexus > backup_nexus.sql
```
