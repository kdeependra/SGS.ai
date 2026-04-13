# SGS.ai Startup Script
# Starts Docker services (redis, hdf5, backend, frontend) and MCP server locally

Write-Host "Starting Docker services..." -ForegroundColor Cyan
docker-compose up --build -d

Write-Host "Starting MCP server on port 8001..." -ForegroundColor Cyan
Start-Process -NoNewWindow python -ArgumentList "$PSScriptRoot\mcp_server\server.py"

Write-Host ""
Write-Host "All services started:" -ForegroundColor Green
Write-Host "  Redis        -> localhost:6379"
Write-Host "  HDF5         -> localhost:5000"
Write-Host "  Backend      -> localhost:8000"
Write-Host "  Frontend     -> localhost:3000"
Write-Host "  MCP Server   -> localhost:8001"
