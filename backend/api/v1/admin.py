from fastapi import APIRouter, Depends, HTTPException
from api.schemas.admin import (
    HealthResponse, IndexInfo, IndicesListResponse,
    CleanupRequest, CleanupResponse,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import admin_service

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/health", response_model=HealthResponse)
def health_check(store: RedisStore = Depends(get_redis_store)):
    return admin_service.ping(store)


@router.post("/indices/init")
def init_indices(store: RedisStore = Depends(get_redis_store)):
    return admin_service.initialize_indices(store)


@router.get("/indices", response_model=IndicesListResponse)
def list_indices(store: RedisStore = Depends(get_redis_store)):
    indices = admin_service.list_indices(store)
    return {"indices": indices}


@router.get("/indices/{name}", response_model=IndexInfo)
def index_info(name: str, store: RedisStore = Depends(get_redis_store)):
    result = admin_service.get_index_info(store, name)
    if not result:
        raise HTTPException(status_code=404, detail="Index not found")
    return result


@router.delete("/cleanup", response_model=CleanupResponse)
def cleanup(body: CleanupRequest, store: RedisStore = Depends(get_redis_store)):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to proceed with cleanup")
    count = admin_service.cleanup_test_data(store, body.prefix)
    return {"deleted_count": count, "prefix": body.prefix}
