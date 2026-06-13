# deploy.ps1 - sobe/atualiza o Nexus no servidor Windows (Docker Desktop), acesso por IP:porta.
#
# Uso (na raiz do repositorio, com o Docker Desktop aberto e "Running"):
#   .\deploy\deploy.ps1            # primeira vez ou atualizacao: git pull + build + up -d
#   .\deploy\deploy.ps1 -NoPull    # so rebuild/up, sem git pull (deploy de codigo local)
#   .\deploy\deploy.ps1 -Firewall  # tambem cria a regra de firewall p/ a porta (precisa ser Admin)
#
# Pre-requisitos: Docker Desktop instalado e RODANDO; Git; arquivo .env criado.
# Guia completo: deploy/windows-server.md

[CmdletBinding()]
param(
  [switch]$NoPull,
  [switch]$Firewall,
  [string]$ComposeFile = "docker-compose.prod.yml"
)

$ErrorActionPreference = "Stop"

# Raiz do repo = pasta acima de /deploy
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
Write-Host "Repo: $repo" -ForegroundColor DarkGray

# 1. Docker esta respondendo?
$null = & docker info 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "Docker nao esta respondendo. Abra o Docker Desktop e espere ficar 'Running', depois rode de novo."
  exit 1
}

# 2. .env existe?
if (-not (Test-Path ".env")) {
  Write-Error ".env nao encontrado. Rode:  Copy-Item .env.prod.example .env  e ajuste as senhas (veja deploy/windows-server.md)."
  exit 1
}

# 3. Porta publicada (do .env, padrao 3001)
$port = "3001"
$envLine = Select-String -Path ".env" -Pattern '^\s*APP_PORT\s*=\s*(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($envLine) { $port = $envLine.Matches[0].Groups[1].Value }

# 4. (opcional) regra de firewall para acesso por outras maquinas da rede
if ($Firewall) {
  $ruleName = "Nexus CRM $port"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    try {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
      Write-Host "Regra de firewall criada para a porta $port." -ForegroundColor Green
    } catch {
      Write-Warning "Nao consegui criar a regra de firewall (rode o PowerShell como Administrador). Detalhe: $($_.Exception.Message)"
    }
  } else {
    Write-Host "Regra de firewall para a porta $port ja existe." -ForegroundColor DarkGray
  }
}

# 5. Atualiza o codigo
if (-not $NoPull) {
  Write-Host "git pull --ff-only origin main ..." -ForegroundColor Cyan
  git pull --ff-only origin main
}

# 6. Build + sobe em background (detached). restart=unless-stopped mantem no ar.
Write-Host "docker compose up -d --build ..." -ForegroundColor Cyan
docker compose -f $ComposeFile up -d --build
if ($LASTEXITCODE -ne 0) { Write-Error "Falha no docker compose up."; exit 1 }

# 7. Limpa imagens orfas do rebuild
$null = & docker image prune -f 2>&1

# 8. Status + endereco de acesso
Write-Host "`nContainers:" -ForegroundColor Cyan
docker compose -f $ComposeFile ps

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" } |
       Select-Object -First 1).IPAddress
Write-Host "`nNexus no ar:" -ForegroundColor Green
Write-Host "  Local:  http://localhost:$port"
if ($ip) { Write-Host "  Rede:   http://$ip`:$port  (precisa da regra de firewall: -Firewall)" }
Write-Host "`nLogs:   docker compose -f $ComposeFile logs -f app" -ForegroundColor DarkGray
