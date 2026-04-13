"""Redis management API – exposes all redis_dev.ipynb functions."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import redis_admin_service

router = APIRouter(prefix="/api/v1/redis", tags=["redis"])


# ── Schemas ──────────────────────────────────────────────────────────

class FlushRequest(BaseModel):
    confirm: bool = False

class BrowseRequest(BaseModel):
    pattern: str = "*"
    limit: int = 100

class DeleteKeysRequest(BaseModel):
    pattern: str
    confirm: bool = False

class CreateIndexRequest(BaseModel):
    index_name: str

class RegisterDatabaseRequest(BaseModel):
    db_name: str
    db_type: str = "postgresql"
    host: str = "localhost"
    port: int = 5432

class RegisterTableRequest(BaseModel):
    table_name: str
    db_sha1: str
    schema_name: str = "public"
    row_count: int = 0

class TokenizeRequest(BaseModel):
    prompt: str

class LookupTokensRequest(BaseModel):
    tokens: list[str]

class IngestTokensRequest(BaseModel):
    tokens: list[str]
    source_sha1: str
    source_type: str
    parent_chain: list[dict] | None = None

class CreateEdgeRequest(BaseModel):
    left_sha1: str
    right_sha1: str
    label: str
    metadata: dict | None = None

class CheckEdgeRequest(BaseModel):
    left_sha1: str
    right_sha1: str
    label: str

class CleanupCategoryRequest(BaseModel):
    categories: list[str]
    confirm: bool = False

class ColumnSearchRequest(BaseModel):
    pattern: str


# ── DB-level endpoints ───────────────────────────────────────────────

@router.post("/flush")
def flush_db(body: FlushRequest, store: RedisStore = Depends(get_redis_store)):
    if not body.confirm:
        raise HTTPException(400, "Set confirm=true to flush")
    return redis_admin_service.flush_db(store)


@router.get("/stats")
def key_stats(store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.get_key_stats(store)


@router.post("/keys/browse")
def browse_keys(body: BrowseRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.browse_keys(store, body.pattern, body.limit)


@router.get("/keys/{key:path}")
def get_key_value(key: str, store: RedisStore = Depends(get_redis_store)):
    result = redis_admin_service.get_key_value(store, key)
    if result["value"] is None:
        raise HTTPException(404, "Key not found")
    return result


@router.post("/keys/delete")
def delete_keys(body: DeleteKeysRequest, store: RedisStore = Depends(get_redis_store)):
    if not body.confirm:
        raise HTTPException(400, "Set confirm=true to delete")
    count = redis_admin_service.delete_keys_by_pattern(store, body.pattern)
    return {"deleted": count, "pattern": body.pattern}


# ── Index management ─────────────────────────────────────────────────

@router.get("/indices")
def list_indices(store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.list_all_indices(store)


@router.post("/indices/init-all")
def init_all_indices(store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.initialize_all_indices(store)


@router.post("/indices/create")
def create_index(body: CreateIndexRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.create_index(store, body.index_name)


@router.delete("/indices/{index_name}")
def drop_index(index_name: str, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.drop_index(store, index_name)


# ── Entity registration ─────────────────────────────────────────────

@router.post("/register/database")
def register_database(body: RegisterDatabaseRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.register_database(store, body.db_name, body.db_type, body.host, body.port)


@router.post("/register/table")
def register_table(body: RegisterTableRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.register_table(store, body.table_name, body.db_sha1, body.schema_name, body.row_count)


# ── Token operations ─────────────────────────────────────────────────

@router.post("/tokens/tokenize")
def tokenize(body: TokenizeRequest):
    return redis_admin_service.tokenize_prompt(body.prompt)


@router.post("/tokens/lookup")
def lookup_tokens(body: LookupTokensRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.lookup_token_refs(store, body.tokens)


@router.post("/tokens/ingest")
def ingest_tokens(body: IngestTokensRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.ingest_tokens(
        store, body.tokens, body.source_sha1, body.source_type, body.parent_chain,
    )


# ── Edge management ──────────────────────────────────────────────────

@router.post("/edges/create")
def create_edge(body: CreateEdgeRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.create_entity_edge(store, body.left_sha1, body.right_sha1, body.label, body.metadata)


@router.post("/edges/check")
def check_edge(body: CheckEdgeRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.check_edge_exists(store, body.left_sha1, body.right_sha1, body.label)


# ── Query functions ──────────────────────────────────────────────────

@router.get("/databases/{db_sha1}")
def database_info(db_sha1: str, store: RedisStore = Depends(get_redis_store)):
    result = redis_admin_service.get_database_info(store, db_sha1)
    if not result:
        raise HTTPException(404, "Database not found")
    return result


@router.post("/columns/search")
def search_columns(body: ColumnSearchRequest, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.search_columns_by_name(store, body.pattern)


@router.get("/columns/{sha1}/stats")
def column_stats(sha1: str, store: RedisStore = Depends(get_redis_store)):
    result = redis_admin_service.get_column_statistics(store, sha1)
    if not result:
        raise HTTPException(404, "Column not found")
    return result


@router.get("/columns/{sha1}/similar")
def similar_columns(sha1: str, store: RedisStore = Depends(get_redis_store)):
    return redis_admin_service.find_similar_columns(store, sha1)


# ── Cleanup ──────────────────────────────────────────────────────────

@router.post("/cleanup")
def cleanup_categories(body: CleanupCategoryRequest, store: RedisStore = Depends(get_redis_store)):
    if not body.confirm:
        raise HTTPException(400, "Set confirm=true to cleanup")
    return redis_admin_service.cleanup_by_category(store, body.categories)


@router.get("/cleanup/categories")
def list_categories():
    return {"categories": list(redis_admin_service.CLEANUP_CATEGORIES.keys())}
