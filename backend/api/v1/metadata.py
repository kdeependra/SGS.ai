import os

import requests
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from api.schemas.metadata import (
    MySQLMetadataRequest, MSSQLMetadataRequest,
    CSVMetadataRequest, DocumentMetadataRequest,
    CombinedMetadataRequest, SourceMetadata, CombinedMetadataResponse,
    AnalyzeMetadataRequest, AnalyzeMetadataResponse,
    PersistMetadataRequest, IngestMetadataRequest, StoredMetadataSummary,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import metadata_service
from services import persist_metadata_service

router = APIRouter(prefix="/api/v1/metadata", tags=["metadata"])


@router.get("/mcp/tools")
def list_mcp_tools():
    """List available MCP tools from the MCP server."""
    import requests
    from config import get_settings
    settings = get_settings()
    try:
        resp = requests.get(f"{settings.mcp_server_url}/api/tools", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MCP server unreachable: {e}")


@router.get("/mcp/health")
def mcp_health():
    """Check MCP server health."""
    import requests
    from config import get_settings
    settings = get_settings()
    try:
        resp = requests.get(f"{settings.mcp_server_url}/health", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MCP server unreachable: {e}")


@router.post("/mysql", response_model=SourceMetadata)
def mysql_metadata(body: MySQLMetadataRequest):
    """Collect metadata for a single MySQL table via MCP server."""
    try:
        return metadata_service.collect_mysql(
            host=body.host, port=body.port, user=body.user,
            password=body.password, database=body.database, table=body.table,
            prompt=body.prompt, db_type=body.db_type, schema=body.schema_name,
        )
    except requests.exceptions.HTTPError as e:
        detail = e.response.text if e.response is not None else str(e)
        raise HTTPException(status_code=502, detail=f"MCP server error: {detail}")
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=502, detail="MCP server unreachable")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mssql", response_model=SourceMetadata)
def mssql_metadata(body: MSSQLMetadataRequest):
    """Collect metadata for a single SQL Server table via MCP server."""
    try:
        return metadata_service.collect_mssql(
            host=body.host, port=body.port, user=body.user,
            password=body.password, database=body.database,
            table=body.table, schema_name=body.schema_name,
        )
    except requests.exceptions.HTTPError as e:
        detail = e.response.text if e.response is not None else str(e)
        raise HTTPException(status_code=502, detail=f"MCP server error: {detail}")
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=502, detail="MCP server unreachable")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/csv/upload", response_model=SourceMetadata)
async def csv_upload_metadata(file: UploadFile = File(...)):
    """Upload a CSV file and collect its metadata."""
    raw = await file.read()
    content = raw.decode("utf-8-sig")
    try:
        return metadata_service.collect_csv(content=content, file_name=file.filename or "upload.csv")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV metadata collection failed: {e}")


@router.post("/document/upload", response_model=SourceMetadata)
async def document_upload_metadata(file: UploadFile = File(...)):
    """Upload a document file and collect metadata."""
    raw = await file.read()
    fname = file.filename or "upload.txt"
    ext = os.path.splitext(fname)[1].lower()
    try:
        if ext in (".docx", ".pdf"):
            return metadata_service.collect_document(raw_bytes=raw, file_name=fname)
        else:
            content = raw.decode("utf-8", errors="replace")
            return metadata_service.collect_document(content=content, file_name=fname)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document metadata collection failed: {e}")


@router.post("/combined", response_model=CombinedMetadataResponse)
def combined_metadata(body: CombinedMetadataRequest):
    """Collect metadata from multiple sources in one request via MCP server."""
    result = metadata_service.collect_combined(
        prompt=body.prompt,
        mysql_params=body.mysql.model_dump() if body.mysql else None,
        csv_params=body.csv.model_dump() if body.csv else None,
        doc_params=body.document.model_dump() if body.document else None,
    )
    return result


@router.post("/analyze", response_model=AnalyzeMetadataResponse)
def analyze_metadata(body: AnalyzeMetadataRequest):
    """Send collected metadata to Claude AI for analysis via MCP server."""
    try:
        return metadata_service.analyze(
            prompt=body.prompt,
            metadata=body.metadata,
            model=body.model,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- Persist / Store / Retrieve ----

@router.post("/store")
def store_metadata(body: PersistMetadataRequest, store: RedisStore = Depends(get_redis_store)):
    """Persist collected metadata into Redis for management."""
    try:
        return persist_metadata_service.persist_metadata(store, body.metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stored", response_model=list[StoredMetadataSummary])
def list_stored(store: RedisStore = Depends(get_redis_store)):
    """List all stored metadata snapshots."""
    return persist_metadata_service.list_stored_metadata(store)


@router.get("/stored/{sha1}")
def get_stored(sha1: str, store: RedisStore = Depends(get_redis_store)):
    """Retrieve a full stored metadata snapshot."""
    result = persist_metadata_service.get_stored_metadata(store, sha1)
    if not result:
        raise HTTPException(status_code=404, detail="Metadata not found")
    return result


@router.delete("/stored/{sha1}")
def delete_stored(sha1: str, store: RedisStore = Depends(get_redis_store)):
    """Delete a stored metadata snapshot and related keys."""
    ok = persist_metadata_service.delete_stored_metadata(store, sha1)
    if not ok:
        raise HTTPException(status_code=404, detail="Metadata not found")
    return {"deleted": sha1}


@router.post("/ingest")
def ingest_metadata(body: IngestMetadataRequest, store: RedisStore = Depends(get_redis_store)):
    """Ingest tokens from collected metadata into Redis using ingest_tokens.

    Extracts tokens from each source, determines source_sha1, source_type,
    and parent_chain, then calls ingest_tokens for each leaf entity.
    """
    try:
        return persist_metadata_service.ingest_all_metadata(store, body.sources, body.P)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
