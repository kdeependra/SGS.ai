# ──────────────────────────────────────────────────────────────
# SGS.ai — Docker-based Production Deployment Script (Windows)
# Usage:  .\deploy.ps1 [-Command up|down|restart|status|logs|build|clean]
# ──────────────────────────────────────────────────────────────
param(
    [Parameter(Position = 0)]
    [ValidateSet("up", "down", "restart", "build", "status", "logs", "clean", "help")]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$Service = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ComposeFile = Join-Path $ScriptDir "docker-compose.prod.yml"
$EnvFile     = Join-Path $ScriptDir ".env.prod"
$ProjectName = "sgs-ai"

function Write-Info  { param($Msg) Write-Host "[INFO]  $Msg" -ForegroundColor Green }
function Write-Warn  { param($Msg) Write-Host "[WARN]  $Msg" -ForegroundColor Yellow }
function Write-Err   { param($Msg) Write-Host "[ERROR] $Msg" -ForegroundColor Red }

function Test-Preflight {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err "Docker is not installed or not in PATH."
        exit 1
    }
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Docker daemon is not running. Start Docker Desktop first."
        exit 1
    }
    if (-not (Test-Path $EnvFile)) {
        Write-Err ".env.prod not found. Copy .env.prod.example to .env.prod and configure it."
        Write-Host "  Copy-Item .env.prod.example .env.prod"
        exit 1
    }
}

function Invoke-Compose {
    $args_list = @("-f", $ComposeFile, "--env-file", $EnvFile, "-p", $ProjectName) + $args
    & docker compose @args_list
}

function Invoke-Build {
    Write-Info "Building production images..."
    Invoke-Compose build --parallel
    Write-Info "Build complete."
}

function Invoke-Up {
    Test-Preflight
    Write-Info "Starting SGS.ai production stack..."
    Invoke-Compose up -d --build --remove-orphans
    Write-Info "Waiting for services to become healthy..."
    Invoke-Compose ps
    Write-Host ""
    Write-Info "Services started:"
    Write-Host "  MySQL        -> localhost:3306"
    Write-Host "  Redis        -> localhost:6379"
    Write-Host "  HDF5         -> localhost:5000"
    Write-Host "  MCP Server   -> localhost:8001"
    Write-Host "  Backend API  -> localhost:8000  (docs: /docs)"
    Write-Host "  Frontend     -> localhost:3000"
}

function Invoke-Down {
    Write-Info "Stopping SGS.ai production stack..."
    Invoke-Compose down
    Write-Info "All services stopped."
}

function Invoke-Restart {
    Write-Info "Restarting SGS.ai production stack..."
    Invoke-Compose down
    Invoke-Up
}

function Invoke-Status {
    Invoke-Compose ps -a
}

function Invoke-Logs {
    param([string]$Svc)
    if ($Svc) {
        Invoke-Compose logs -f --tail 100 $Svc
    } else {
        Invoke-Compose logs -f --tail 50
    }
}

function Invoke-Clean {
    Write-Warn "This will stop all services and remove volumes (data will be lost)."
    $reply = Read-Host "Are you sure? [y/N]"
    if ($reply -match '^[Yy]$') {
        Invoke-Compose down -v --remove-orphans
        Write-Info "Cleaned up all containers and volumes."
    } else {
        Write-Info "Cancelled."
    }
}

function Show-Help {
    Write-Host "SGS.ai Production Deployment"
    Write-Host ""
    Write-Host "Usage: .\deploy.ps1 <command> [service]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  up        Build and start all services"
    Write-Host "  down      Stop all services"
    Write-Host "  restart   Restart all services"
    Write-Host "  build     Build images without starting"
    Write-Host "  status    Show service status"
    Write-Host "  logs      Tail logs (optionally: logs <service>)"
    Write-Host "  clean     Stop services and remove volumes (destructive)"
    Write-Host "  help      Show this help"
}

switch ($Command) {
    "up"      { Invoke-Up }
    "down"    { Invoke-Down }
    "restart" { Invoke-Restart }
    "build"   { Invoke-Build }
    "status"  { Invoke-Status }
    "logs"    { Invoke-Logs -Svc $Service }
    "clean"   { Invoke-Clean }
    "help"    { Show-Help }
    default   { Show-Help }
}
