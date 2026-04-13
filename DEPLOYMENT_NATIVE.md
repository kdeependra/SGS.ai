# SGS.ai — Production Deployment Guide (Without Docker)

This guide covers deploying SGS.ai directly on a host machine without Docker.

---

## Prerequisites

| Component    | Version     | Purpose                              |
|------------- |-------------|--------------------------------------|
| Python       | ≥ 3.12      | Backend, MCP server, HDF5 server     |
| Node.js      | ≥ 20 LTS    | Frontend build                       |
| Julia        | 1.10.x      | HllSets algebraic engine             |
| MySQL        | 8.0         | Authentication and demo data         |
| Redis        | ≥ 7.0       | In-memory metadata & search index    |
| Nginx        | ≥ 1.24      | Frontend static file serving & proxy |
| Graphviz     | any recent  | Graph visualisation (optional)       |

---

## 1. Install System Dependencies

### Ubuntu / Debian

```bash
# System packages
sudo apt update && sudo apt install -y \
    python3.12 python3.12-venv python3-pip \
    nodejs npm \
    mysql-server-8.0 \
    redis-server \
    nginx \
    graphviz \
    curl wget

# Julia
wget https://julialang-s3.julialang.org/bin/linux/x64/1.10/julia-1.10.7-linux-x86_64.tar.gz
sudo tar -xzf julia-1.10.7-linux-x86_64.tar.gz -C /usr/local --strip-components=1
rm julia-1.10.7-linux-x86_64.tar.gz
```

### Windows

1. Install [Python 3.12+](https://www.python.org/downloads/)
2. Install [Node.js 20 LTS](https://nodejs.org/)
3. Install [Julia 1.10.x](https://julialang.org/downloads/)
4. Install [MySQL 8.0](https://dev.mysql.com/downloads/installer/)
5. Install [Redis for Windows](https://github.com/tporadowski/redis/releases) (or use WSL)
6. Install [Nginx for Windows](https://nginx.org/en/download.html)

Ensure all binaries are in your `PATH`.

---

## 2. Clone the Repository

```bash
git clone <repo-url> /opt/sgs-ai
cd /opt/sgs-ai
```

---

## 3. Configure MySQL

### Start MySQL

```bash
# Linux
sudo systemctl enable --now mysql

# Windows (if installed as service, it starts automatically)
```

### Initialise the Database

Run the init scripts in order:

```bash
mysql -u root -p < mysql/init/01_auth_schema.sql
mysql -u root -p < mysql/init/02_ecommerce_demo.sql
mysql -u root -p < mysql/init/03_ecommerce_extended.sql
```

This creates:
- `metadatamgmt` database with authentication tables (roles, users)
- Demo ecommerce data (18 tables)
- Default users: `admin / admin123`, `user / user123`

---

## 4. Configure Redis

### Start Redis

```bash
# Linux
sudo systemctl enable --now redis-server

# Windows
redis-server redis/redis.conf
```

Verify: `redis-cli ping` should return `PONG`.

---

## 5. Set Up the Backend

### Create a Virtual Environment

```bash
cd /opt/sgs-ai
python3 -m venv .venv
source .venv/bin/activate        # Linux
# .venv\Scripts\Activate.ps1     # Windows PowerShell
```

### Install Python Dependencies

```bash
pip install -r <(python -c "
import tomllib, pathlib
d = tomllib.loads(pathlib.Path('pyproject.toml').read_text())
for dep in d['project']['dependencies']:
    print(dep)
")
```

Or install directly:

```bash
pip install \
    "fastapi>=0.115.0" "uvicorn>=0.34.0" "redis>=5.2.1" \
    "mysql-connector-python>=9.0.0" "pydantic-settings>=2.0.0" \
    "python-dotenv>=1.1.0" "mmh3>=5.1.0" "julia>=0.6.2" \
    "anthropic>=0.49.0" "pyjwt>=2.8.0" "passlib[bcrypt]>=1.7.4" \
    "python-multipart>=0.0.9" "h5py>=3.13.0" "numpy>=2.2.3" \
    "pandas>=2.2.3" "networkx>=3.5" "requests>=2.32.3" \
    "pyyaml>=6.0.2" "graphviz>=0.20.3" "python-docx>=1.1.0" \
    "pdfplumber>=0.11.0" "openai>=1.69.0"
```

### Bootstrap Julia

```bash
cd /opt/sgs-ai/backend
python boot_julia.py
```

This installs the Julia-Python bridge and compiles the HllSets package. Expect this step to take several minutes on first run.

### Create Backend Environment File

```bash
cat > /opt/sgs-ai/backend/.env << 'EOF'
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
HLLSETS_PATH=/opt/sgs-ai/backend/HllSets/src/HllSets.jl
MCP_SERVER_URL=http://localhost:8001
ANTHROPIC_API_KEY=sk-ant-your-key-here
AUTH_DB_HOST=localhost
AUTH_DB_PORT=3306
AUTH_DB_USER=root
AUTH_DB_PASSWORD=your_mysql_password
AUTH_DB_NAME=metadatamgmt
CORS_ORIGINS=["http://localhost:3000"]
EOF
```

> **Important**: Replace `ANTHROPIC_API_KEY` and `AUTH_DB_PASSWORD` with real values. Restrict file permissions: `chmod 600 backend/.env`

### Test the Backend

```bash
cd /opt/sgs-ai/backend
python main.py
# Should print: Uvicorn running on http://0.0.0.0:8000
# Verify: curl http://localhost:8000/
# Stop with Ctrl+C
```

---

## 6. Set Up the MCP Server

### Install MCP Server Dependencies

```bash
pip install -r /opt/sgs-ai/mcp_server/requirements.txt
```

### Create MCP Server Environment File

```bash
cat > /opt/sgs-ai/mcp_server/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-your-key-here
EOF
chmod 600 /opt/sgs-ai/mcp_server/.env
```

### Test the MCP Server

```bash
cd /opt/sgs-ai/mcp_server
python -m uvicorn server:app --host 0.0.0.0 --port 8001
# Verify: curl http://localhost:8001/health
```

---

## 7. Build and Serve the Frontend

### Build the Frontend

```bash
cd /opt/sgs-ai/frontend
npm ci
npm run build
```

The production build is output to `frontend/dist/`.

### Configure Nginx

Create `/etc/nginx/sites-available/sgs-ai`:

```nginx
server {
    listen 3000;
    server_name _;

    root /opt/sgs-ai/frontend/dist;
    index index.html;

    # API proxy to backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
}
```

Enable and start:

```bash
sudo ln -sf /etc/nginx/sites-available/sgs-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl enable --now nginx
```

**Windows**: Copy the config to `nginx/conf/nginx.conf` and run `nginx.exe`.

---

## 8. Run as System Services (Linux)

Create systemd units so services start on boot and restart on failure.

### Backend Service

```bash
sudo tee /etc/systemd/system/sgs-backend.service << 'EOF'
[Unit]
Description=SGS.ai Backend API
After=network.target mysql.service redis.service
Requires=mysql.service redis.service

[Service]
Type=simple
User=sgs
WorkingDirectory=/opt/sgs-ai/backend
ExecStart=/opt/sgs-ai/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
EnvironmentFile=/opt/sgs-ai/backend/.env

[Install]
WantedBy=multi-user.target
EOF
```

### MCP Server Service

```bash
sudo tee /etc/systemd/system/sgs-mcp.service << 'EOF'
[Unit]
Description=SGS.ai MCP Server
After=network.target mysql.service

[Service]
Type=simple
User=sgs
WorkingDirectory=/opt/sgs-ai/mcp_server
ExecStart=/opt/sgs-ai/.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5
EnvironmentFile=/opt/sgs-ai/mcp_server/.env

[Install]
WantedBy=multi-user.target
EOF
```

### Enable and Start

```bash
sudo useradd -r -s /usr/sbin/nologin sgs
sudo chown -R sgs:sgs /opt/sgs-ai

sudo systemctl daemon-reload
sudo systemctl enable --now sgs-backend sgs-mcp
```

---

## 9. Run as Services (Windows)

Use [NSSM](https://nssm.cc/) to register Python processes as Windows services, or run them in the foreground with the startup script:

```powershell
# Activate venv
.\.venv\Scripts\Activate.ps1

# Start MCP server in background
Start-Process -NoNewWindow python -ArgumentList "mcp_server\server.py"

# Start backend
cd backend
python main.py
```

For a persistent setup with NSSM:

```powershell
# Install NSSM, then:
nssm install SGS-Backend "C:\path\to\.venv\Scripts\python.exe" "-m uvicorn main:app --host 0.0.0.0 --port 8000"
nssm set SGS-Backend AppDirectory "C:\path\to\SGS.ai\backend"
nssm start SGS-Backend

nssm install SGS-MCP "C:\path\to\.venv\Scripts\python.exe" "-m uvicorn server:app --host 0.0.0.0 --port 8001"
nssm set SGS-MCP AppDirectory "C:\path\to\SGS.ai\mcp_server"
nssm start SGS-MCP
```

---

## 10. Verify the Deployment

| Service    | URL / Command                    | Expected Result           |
|------------|----------------------------------|---------------------------|
| MySQL      | `mysql -u root -p -e "SELECT 1"` | `1`                      |
| Redis      | `redis-cli ping`                 | `PONG`                   |
| MCP Server | `curl http://localhost:8001/health` | `200 OK`               |
| Backend    | `curl http://localhost:8000/`    | JSON with version info   |
| Backend    | `curl http://localhost:8000/docs` | Swagger UI              |
| Frontend   | `curl http://localhost:3000/`    | HTML page                |

Open `http://localhost:3000` in a browser to access the application.

---

## Service Architecture

```
                    ┌──────────────────────┐
                    │    Nginx (:3000)      │
                    │  Static files + proxy │
                    └──────────┬───────────┘
                               │ /api/ →
                    ┌──────────▼───────────┐
                    │   Backend (:8000)     │
                    │   FastAPI + Julia     │
                    └──┬──────┬──────┬─────┘
                       │      │      │
              ┌────────▼┐  ┌──▼───┐ ┌▼────────┐
              │  Redis   │  │MySQL │ │MCP Server│
              │  :6379   │  │:3306 │ │  :8001   │
              └──────────┘  └──────┘ └──────────┘
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ModuleNotFoundError: mmh3` | Missing Python dependency | `pip install mmh3` in the venv |
| `julia.install()` hangs | First-time Julia compilation | Wait 5–10 minutes; it's building caches |
| Redis connection refused | Redis not running | `sudo systemctl start redis-server` |
| MySQL access denied | Wrong credentials | Check `AUTH_DB_PASSWORD` in `backend/.env` |
| Frontend shows blank page | Build not run | `cd frontend && npm run build` |
| 502 Bad Gateway on `/api/` | Backend not running | Check `systemctl status sgs-backend` |
| MCP endpoints fail | Missing API key | Set `ANTHROPIC_API_KEY` in `.env` files |

---

## Updating

```bash
cd /opt/sgs-ai
git pull

# Rebuild frontend
cd frontend && npm ci && npm run build

# Restart services
sudo systemctl restart sgs-backend sgs-mcp
sudo systemctl reload nginx
```

---

## Security Checklist

- [ ] Change default MySQL password (`admin` → strong password)
- [ ] Change default user passwords in `01_auth_schema.sql`
- [ ] Restrict `.env` file permissions (`chmod 600`)
- [ ] Run services as a non-root user (`sgs`)
- [ ] Configure a firewall — expose only port 3000 externally
- [ ] Add TLS termination (Nginx with Let's Encrypt or a reverse proxy)
- [ ] Set `CORS_ORIGINS` to your actual domain instead of `localhost`
- [ ] Enable Redis password authentication in `redis.conf`
