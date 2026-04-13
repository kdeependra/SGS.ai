# SGS.ai — Production Deployment Guide

## Prerequisites

- **Docker Engine** ≥ 24.0 (or Docker Desktop)
- **Docker Compose** v2 (included with Docker Desktop)
- **Ports available**: 3000, 3306, 5000, 6379, 8000, 8001
- **Anthropic API key** for the MCP server and backend

---

## 1. Clone the Repository

```bash
git clone <repo-url> SGS.ai
cd SGS.ai
```

## 2. Configure Environment

```bash
cp .env.prod.example .env.prod
```

Edit `.env.prod` and set the required values:

| Variable              | Required | Description                          |
|-----------------------|----------|--------------------------------------|
| `MYSQL_ROOT_PASSWORD` | Yes      | MySQL root password (use a strong one) |
| `ANTHROPIC_API_KEY`   | Yes      | Anthropic API key for AI features    |
| `AUTH_DB_USER`        | No       | DB user (default: `root`)            |
| `AUTH_DB_NAME`        | No       | DB name (default: `metadatamgmt`)    |
| `MYSQL_PORT`          | No       | Host port for MySQL (default: 3306)  |
| `REDIS_PORT`          | No       | Host port for Redis (default: 6379)  |
| `HDF5_PORT`           | No       | Host port for HDF5 (default: 5000)   |
| `MCP_PORT`            | No       | Host port for MCP server (default: 8001) |
| `BACKEND_PORT`        | No       | Host port for backend API (default: 8000) |
| `FRONTEND_PORT`       | No       | Host port for frontend (default: 3000) |

## 3. Deploy

### Windows (PowerShell)

```powershell
.\deploy.ps1 up
```

### Linux / macOS

```bash
chmod +x deploy.sh
./deploy.sh up
```

The script will:
1. Validate Docker is running and `.env.prod` exists
2. Build all images in parallel
3. Start services in dependency order (MySQL → Redis → HDF5 → MCP → Backend → Frontend)
4. Wait for health checks to pass

## 4. Verify

Check that all services are healthy:

```bash
# Windows
.\deploy.ps1 status

# Linux/macOS
./deploy.sh status
```

All six services should show `healthy`:

| Service    | URL                        | Health endpoint |
|------------|----------------------------|-----------------|
| MySQL      | `localhost:3306`           | mysqladmin ping |
| Redis      | `localhost:6379`           | redis-cli ping  |
| HDF5       | `localhost:5000`           | GET /           |
| MCP Server | `localhost:8001`           | GET /health     |
| Backend    | `localhost:8000`           | GET /           |
| Frontend   | `localhost:3000`           | GET /           |

Open `http://localhost:3000` in a browser to access the application.
API documentation is at `http://localhost:8000/docs`.

---

## Service Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Frontend │────▶│ Backend  │────▶│  Redis   │
│  :3000   │     │  :8000   │     │  :6379   │
└──────────┘     └────┬─────┘     └──────────┘
                      │
              ┌───────┼───────┐
              ▼       ▼       ▼
         ┌────────┐ ┌─────┐ ┌─────┐
         │  MCP   │ │MySQL│ │HDF5 │
         │ :8001  │ │:3306│ │:5000│
         └────────┘ └─────┘ └─────┘
```

- **Frontend**: Nginx serving the React SPA; proxies `/api/` to the backend
- **Backend**: FastAPI application with Julia (HllSets) integration
- **MCP Server**: Metadata Collection Protocol server (MySQL, CSV, document sources)
- **MySQL**: Authentication database and demo data
- **Redis**: In-memory metadata store (HyperLogLog sets, search index)
- **HDF5**: Hierarchical data storage service

---

## Operations

### View logs

```bash
# All services
.\deploy.ps1 logs          # Windows
./deploy.sh logs           # Linux

# Single service
.\deploy.ps1 logs backend
./deploy.sh logs backend
```

### Restart

```bash
.\deploy.ps1 restart       # Windows
./deploy.sh restart        # Linux
```

### Stop

```bash
.\deploy.ps1 down          # Windows
./deploy.sh down           # Linux
```

### Full cleanup (removes data volumes)

```bash
.\deploy.ps1 clean         # Windows
./deploy.sh clean          # Linux
```

> **Warning**: `clean` deletes MySQL and Redis data volumes. This is irreversible.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Docker daemon is not running` | Docker Desktop not started | Start Docker Desktop and retry |
| `.env.prod not found` | Missing config file | `cp .env.prod.example .env.prod` and edit |
| Backend keeps restarting | MySQL not ready yet | Wait 30–60s; MySQL health check takes time on first start |
| `port already in use` | Another process on that port | Change the port in `.env.prod` or stop the conflicting process |
| Frontend shows 502 | Backend not healthy yet | Check `deploy status`; wait for backend health check |
| MCP endpoints fail | Missing `ANTHROPIC_API_KEY` | Set a valid key in `.env.prod` and restart |

---

## Updating

To deploy a new version:

```bash
git pull
.\deploy.ps1 up            # Windows — rebuilds changed images automatically
./deploy.sh up             # Linux
```

Data in MySQL and Redis volumes is preserved across restarts and updates.
