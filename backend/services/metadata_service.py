"""Metadata collection service – uses local collectors with MCP server fallback."""
import logging
import requests
from config import get_settings
from mcp.csv_collector import collect_csv_metadata
from mcp.doc_collector import collect_document_metadata

log = logging.getLogger(__name__)


def _call_mcp(tool: str, payload: dict) -> dict:
    """Call an MCP server REST API tool endpoint."""
    settings = get_settings()
    url = f"{settings.mcp_server_url}/api/tools/{tool}"
    resp = requests.post(url, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def collect_mysql(host: str, port: int, user: str, password: str,
                  database: str, table: str = "", prompt: str = "",
                  db_type: str = "mysql", schema: str = "") -> dict:
    return _call_mcp("mysql_metadata", {
        "host": host, "port": port, "user": user,
        "password": password, "database": database, "table": table,
        "prompt": prompt, "db_type": db_type, "schema": schema,
    })


def collect_mssql(host: str, port: int, user: str, password: str,
                  database: str, table: str, schema_name: str = "dbo") -> dict:
    return _call_mcp("mssql_metadata", {
        "host": host, "port": port, "user": user,
        "password": password, "database": database, "table": table,
        "schema_name": schema_name,
    })


def collect_csv(content: str, file_name: str = "data.csv") -> dict:
    """Collect CSV metadata using local collector (MCP fallback)."""
    try:
        return collect_csv_metadata(content=content, file_name=file_name)
    except Exception as e:
        log.warning("Local CSV collector failed (%s), trying MCP server", e)
        return _call_mcp("csv_metadata", {"content": content, "file_name": file_name})


def collect_document(content: str | None = None, file_name: str = "document.txt",
                     raw_bytes: bytes | None = None) -> dict:
    """Collect document metadata using local collector (MCP fallback)."""
    try:
        return collect_document_metadata(content=content, file_name=file_name, raw_bytes=raw_bytes)
    except Exception as e:
        log.warning("Local doc collector failed (%s), trying MCP server", e)
        if raw_bytes is not None:
            raise  # binary files can't fall back to MCP text API
        return _call_mcp("document_metadata", {"content": content, "file_name": file_name})


def collect_combined(prompt: str = "", *, mysql_params: dict | None = None,
                     csv_params: dict | None = None,
                     doc_params: dict | None = None) -> dict:
    """Collect metadata from all requested sources via the MCP server."""
    return _call_mcp("combined", {
        "prompt": prompt,
        "mysql": mysql_params,
        "csv": csv_params,
        "document": doc_params,
    })


def analyze(prompt: str, metadata: list[dict], model: str = "claude-sonnet-4-20250514") -> dict:
    """Send collected metadata to Claude for AI-powered analysis via the MCP server."""
    return _call_mcp("analyze", {
        "prompt": prompt,
        "metadata": metadata,
        "model": model,
    })
