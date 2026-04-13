from fastapi import APIRouter, Depends, HTTPException, Query
from api.schemas.source import (
    DatabaseCreate, DatabaseResponse, DatabaseHierarchy,
    TableCreate, TableResponse,
    ColumnLoad, ColumnBatchLoad, ColumnResponse, ColumnBatchResponse, ColumnStats,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import source_service

router = APIRouter(prefix="/api/v1/sources", tags=["sources"])


@router.post("/databases", response_model=DatabaseResponse)
def create_database(body: DatabaseCreate, store: RedisStore = Depends(get_redis_store)):
    result = source_service.register_database(store, body.db_name, body.db_type, body.host, body.port)
    return result


@router.get("/databases/{sha1}", response_model=DatabaseHierarchy)
def get_database(sha1: str, store: RedisStore = Depends(get_redis_store)):
    result = source_service.get_database_info(store, sha1)
    if not result:
        raise HTTPException(status_code=404, detail="Database not found")
    return result


@router.post("/tables", response_model=TableResponse)
def create_table(body: TableCreate, store: RedisStore = Depends(get_redis_store)):
    result = source_service.register_table(store, body.table_name, body.db_sha1, body.schema_name, body.row_count)
    return result


@router.post("/columns", response_model=ColumnResponse)
def load_column(body: ColumnLoad, store: RedisStore = Depends(get_redis_store)):
    result = source_service.load_column_with_hllset(
        store, body.column_name, body.table_sha1, body.db_sha1,
        body.values, body.data_type, body.nullable,
    )
    return result


@router.post("/columns/batch", response_model=ColumnBatchResponse)
def load_columns_batch(body: ColumnBatchLoad, store: RedisStore = Depends(get_redis_store)):
    columns = []
    for col in body.columns:
        result = source_service.load_column_with_hllset(
            store, col.column_name, col.table_sha1, col.db_sha1,
            col.values, col.data_type, col.nullable,
        )
        columns.append(result)
    return {"columns": columns}


@router.get("/columns/search")
def search_columns(pattern: str = Query(...), store: RedisStore = Depends(get_redis_store)):
    return source_service.search_columns_by_name(store, pattern)


@router.get("/columns/{sha1}/stats", response_model=ColumnStats)
def column_stats(sha1: str, store: RedisStore = Depends(get_redis_store)):
    result = source_service.get_column_statistics(store, sha1)
    if not result:
        raise HTTPException(status_code=404, detail="Column not found")
    return result
