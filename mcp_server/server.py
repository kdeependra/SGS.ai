"""SGS.ai MCP Server — Metadata Collection Protocol.

Exposes metadata collection tools as both REST API endpoints (for the backend)
and MCP SSE protocol (for MCP clients like Claude Desktop).

Sources supported:
  1. MySQL database tables
  2. CSV files
  3. Text documents (markdown, JSON, XML, etc.)
"""

import json
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Running inside Docker? Rewrite localhost → host.docker.internal
_IN_DOCKER = Path("/.dockerenv").exists() or os.getenv("RUNNING_IN_DOCKER") == "1"


def _resolve_host(host: str) -> str:
    """Translate localhost to host.docker.internal when running in a container."""
    if _IN_DOCKER and host in ("localhost", "127.0.0.1"):
        return "host.docker.internal"
    return host

from collectors.mysql_collector import collect_mysql_metadata
from collectors.mssql_collector import collect_mssql_metadata
from collectors.csv_collector import collect_csv_metadata
from collectors.doc_collector import collect_document_metadata

# ---------------------------------------------------------------------------
# FastAPI REST API (used by the SGS.ai backend)
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SGS.ai MCP Server",
    version="0.1.0",
    description="Metadata Collection Protocol server for MySQL, CSV, and document sources",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Request schemas ----

class MySQLRequest(BaseModel):
    host: str = "localhost"
    port: int = 3306
    user: str
    password: str
    database: str
    table: str = ""
    prompt: str = ""
    db_type: str = "mysql"
    schema_name: str = ""


class MSSQLRequest(BaseModel):
    host: str = "localhost"
    port: int = 1433
    user: str
    password: str
    database: str
    table: str
    schema_name: str = "dbo"


class CSVRequest(BaseModel):
    content: str
    file_name: str = "data.csv"


class DocumentRequest(BaseModel):
    content: str
    file_name: str = "document.txt"


class CombinedRequest(BaseModel):
    prompt: str = ""
    mysql: MySQLRequest | None = None
    mssql: MSSQLRequest | None = None
    csv: CSVRequest | None = None
    document: DocumentRequest | None = None


class AnalyzeRequest(BaseModel):
    prompt: str
    metadata: list[dict]
    model: str = "claude-sonnet-4-20250514"


# ---- Tool catalogue ----

MCP_TOOLS = [
    {
        "name": "mysql_metadata",
        "description": "Collect schema metadata for a MySQL database table including columns, indexes, row count, and data size.",
        "input_schema": MySQLRequest.model_json_schema(),
    },
    {
        "name": "mssql_metadata",
        "description": "Collect schema metadata for a Microsoft SQL Server database table including columns, indexes, and row count.",
        "input_schema": MSSQLRequest.model_json_schema(),
    },
    {
        "name": "csv_metadata",
        "description": "Analyze CSV data and return structural metadata: column names, inferred types, null rates, unique counts.",
        "input_schema": CSVRequest.model_json_schema(),
    },
    {
        "name": "document_metadata",
        "description": "Analyze a text document and return metadata: line/word/char counts, document structure, and top keywords.",
        "input_schema": DocumentRequest.model_json_schema(),
    },
]


# ---- REST endpoints ----

@app.get("/health")
def health():
    return {"status": "ok", "service": "mcp-metadata-server", "version": "0.1.0"}


@app.get("/api/tools")
def list_tools():
    """List available MCP tools."""
    return {"tools": MCP_TOOLS}


@app.post("/api/tools/mysql_metadata")
def api_mysql_metadata(body: MySQLRequest):
    try:
        return collect_mysql_metadata(_resolve_host(body.host), body.port, body.user, body.password, body.database, body.table, body.prompt)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/api/tools/mssql_metadata")
def api_mssql_metadata(body: MSSQLRequest):
    try:
        return collect_mssql_metadata(_resolve_host(body.host), body.port, body.user, body.password,
                                      body.database, body.table, body.schema_name)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/api/tools/csv_metadata")
def api_csv_metadata(body: CSVRequest):
    return collect_csv_metadata(content=body.content, file_name=body.file_name)


@app.post("/api/tools/document_metadata")
def api_document_metadata(body: DocumentRequest):
    return collect_document_metadata(content=body.content, file_name=body.file_name)


@app.post("/api/tools/combined")
def api_combined(body: CombinedRequest):
    """Collect metadata from all configured sources in a single call."""
    sources: list[dict] = []
    errors: list[dict] = []

    if body.mysql:
        try:
            sources.append(collect_mysql_metadata(
                _resolve_host(body.mysql.host), body.mysql.port, body.mysql.user,
                body.mysql.password, body.mysql.database, body.mysql.table,
            ))
        except Exception as e:
            errors.append({"source": "mysql", "error": str(e)})

    if body.mssql:
        try:
            sources.append(collect_mssql_metadata(
                _resolve_host(body.mssql.host), body.mssql.port, body.mssql.user,
                body.mssql.password, body.mssql.database, body.mssql.table,
                body.mssql.schema_name,
            ))
        except Exception as e:
            errors.append({"source": "mssql", "error": str(e)})

    if body.csv:
        try:
            sources.append(collect_csv_metadata(
                content=body.csv.content, file_name=body.csv.file_name,
            ))
        except Exception as e:
            errors.append({"source": "csv", "error": str(e)})

    if body.document:
        try:
            sources.append(collect_document_metadata(
                content=body.document.content, file_name=body.document.file_name,
            ))
        except Exception as e:
            errors.append({"source": "document", "error": str(e)})

    return {"prompt": body.prompt, "sources": sources, "errors": errors}


@app.post("/api/tools/analyze")
def api_analyze(body: AnalyzeRequest):
    """Send collected metadata to Claude for AI-powered analysis."""
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    client = anthropic.Anthropic(api_key=api_key)

    # Build context from metadata
    metadata_text = json.dumps(body.metadata, indent=2, default=str)

    system_prompt = (
        "You are a data analyst assistant for SGS.ai — a multi-source data discovery platform. "
        "You receive structured metadata from databases (MySQL, SQL Server), CSV files, and documents. "
        "Analyze the metadata and answer the user's question. Be specific, cite column names, types, "
        "and statistics. If asked for queries, write valid SQL. Format your response in Markdown."
    )

    message = client.messages.create(
        model=body.model,
        max_tokens=4096,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Here is the collected metadata from my data sources:\n\n"
                    f"```json\n{metadata_text}\n```\n\n"
                    f"My question: {body.prompt}"
                ),
            }
        ],
    )

    # Extract text from response
    result_text = ""
    for block in message.content:
        if block.type == "text":
            result_text += block.text

    return {
        "analysis": result_text,
        "model": message.model,
        "usage": {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        },
    }


# ---------------------------------------------------------------------------
# MCP SSE Protocol (for MCP clients like Claude Desktop)
# ---------------------------------------------------------------------------

try:
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("sgs-metadata-collector")

    @mcp.tool()
    def mysql_metadata(host: str, port: int, user: str, password: str,
                       database: str, table: str) -> str:
        """Collect schema metadata for a MySQL database table including columns, indexes, row count, and data size."""
        result = collect_mysql_metadata(_resolve_host(host), port, user, password, database, table)
        return json.dumps(result, default=str)

    @mcp.tool()
    def mssql_metadata(host: str, port: int, user: str, password: str,
                       database: str, table: str, schema_name: str = "dbo") -> str:
        """Collect schema metadata for a Microsoft SQL Server database table including columns, indexes, and row count."""
        result = collect_mssql_metadata(_resolve_host(host), port, user, password, database, table, schema_name)
        return json.dumps(result, default=str)

    @mcp.tool()
    def csv_metadata(content: str, file_name: str = "data.csv") -> str:
        """Analyze CSV data and return structural metadata: column names, inferred types, null rates, unique counts."""
        result = collect_csv_metadata(content=content, file_name=file_name)
        return json.dumps(result, default=str)

    @mcp.tool()
    def document_metadata(content: str, file_name: str = "document.txt") -> str:
        """Analyze a text document and return metadata: line/word/char counts, document structure, and top keywords."""
        result = collect_document_metadata(content=content, file_name=file_name)
        return json.dumps(result, default=str)

    @mcp.tool()
    def list_source_types() -> str:
        """List the available data source types for metadata collection."""
        return json.dumps({
            "sources": [
                {"type": "mysql", "description": "MySQL database table", "tool": "mysql_metadata"},
                {"type": "mssql", "description": "Microsoft SQL Server table", "tool": "mssql_metadata"},
                {"type": "csv", "description": "CSV file", "tool": "csv_metadata"},
                {"type": "document", "description": "Text document", "tool": "document_metadata"},
            ]
        })

    @mcp.tool()
    def analyze_metadata(prompt: str, metadata_json: str, model: str = "claude-sonnet-4-20250514") -> str:
        """Analyze collected metadata using Claude AI. metadata_json should be a JSON array of source metadata objects."""
        import anthropic

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return json.dumps({"error": "ANTHROPIC_API_KEY not configured"})

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model,
            max_tokens=4096,
            system=(
                "You are a data analyst assistant for SGS.ai. "
                "Analyze the provided metadata and answer the user's question. "
                "Be specific, cite column names and types. Format in Markdown."
            ),
            messages=[{
                "role": "user",
                "content": f"Metadata:\n```json\n{metadata_json}\n```\n\nQuestion: {prompt}",
            }],
        )
        result_text = "".join(b.text for b in message.content if b.type == "text")
        return json.dumps({
            "analysis": result_text,
            "model": message.model,
            "usage": {"input_tokens": message.usage.input_tokens, "output_tokens": message.usage.output_tokens},
        })

    # Mount MCP SSE app under /mcp
    try:
        sse_app = mcp.sse_app()
        app.mount("/mcp", sse_app)
    except Exception:
        pass  # SSE mount not supported in this mcp version

except ImportError:
    pass  # mcp package not installed — REST-only mode


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
