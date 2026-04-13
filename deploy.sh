#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# SGS.ai — Docker-based Production Deployment Script
# Usage:  ./deploy.sh [up|down|restart|status|logs|build|clean]
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$SCRIPT_DIR/.env.prod"
PROJECT_NAME="sgs-ai"

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Pre-flight checks ────────────────────────────────────────
preflight() {
    if ! command -v docker &>/dev/null; then
        error "Docker is not installed or not in PATH."
        exit 1
    fi
    if ! docker info &>/dev/null; then
        error "Docker daemon is not running."
        exit 1
    fi
    if [ ! -f "$ENV_FILE" ]; then
        error ".env.prod not found. Copy .env.prod.example to .env.prod and configure it."
        echo "  cp .env.prod.example .env.prod"
        exit 1
    fi
}

compose() {
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" -p "$PROJECT_NAME" "$@"
}

# ── Commands ──────────────────────────────────────────────────
cmd_build() {
    info "Building production images..."
    compose build --parallel
    info "Build complete."
}

cmd_up() {
    preflight
    info "Starting SGS.ai production stack..."
    compose up -d --build --remove-orphans
    info "Waiting for services to become healthy..."
    compose ps
    echo ""
    info "Services started:"
    echo "  MySQL        -> localhost:${MYSQL_PORT:-3306}"
    echo "  Redis        -> localhost:${REDIS_PORT:-6379}"
    echo "  HDF5         -> localhost:${HDF5_PORT:-5000}"
    echo "  MCP Server   -> localhost:${MCP_PORT:-8001}"
    echo "  Backend API  -> localhost:${BACKEND_PORT:-8000}  (docs: /docs)"
    echo "  Frontend     -> localhost:${FRONTEND_PORT:-3000}"
}

cmd_down() {
    info "Stopping SGS.ai production stack..."
    compose down
    info "All services stopped."
}

cmd_restart() {
    info "Restarting SGS.ai production stack..."
    compose down
    cmd_up
}

cmd_status() {
    compose ps -a
}

cmd_logs() {
    local service="${1:-}"
    if [ -n "$service" ]; then
        compose logs -f --tail 100 "$service"
    else
        compose logs -f --tail 50
    fi
}

cmd_clean() {
    warn "This will stop all services and remove volumes (data will be lost)."
    read -p "Are you sure? [y/N] " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        compose down -v --remove-orphans
        info "Cleaned up all containers and volumes."
    else
        info "Cancelled."
    fi
}

cmd_help() {
    echo "SGS.ai Production Deployment"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  up        Build and start all services"
    echo "  down      Stop all services"
    echo "  restart   Restart all services"
    echo "  build     Build images without starting"
    echo "  status    Show service status"
    echo "  logs      Tail logs (optionally: logs <service>)"
    echo "  clean     Stop services and remove volumes (destructive)"
    echo "  help      Show this help"
}

# ── Entrypoint ────────────────────────────────────────────────
case "${1:-help}" in
    up)       cmd_up ;;
    down)     cmd_down ;;
    restart)  cmd_restart ;;
    build)    cmd_build ;;
    status)   cmd_status ;;
    logs)     shift; cmd_logs "$@" ;;
    clean)    cmd_clean ;;
    help|*)   cmd_help ;;
esac
