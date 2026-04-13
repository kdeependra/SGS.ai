from fastapi import APIRouter, Depends, HTTPException
from api.schemas.hllset import (
    HLLSetStoreRequest, HLLSetStoreResponse,
    HLLSetRetrieveResponse,
    HLLSetOperationRequest, HLLSetOperationResponse,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import hllset_service

router = APIRouter(prefix="/api/v1/hllsets", tags=["hllsets"])


@router.post("/store", response_model=HLLSetStoreResponse)
def store_hllset(body: HLLSetStoreRequest, store: RedisStore = Depends(get_redis_store)):
    result = hllset_service.store_hllset(store, body.key, body.values)
    return result


@router.get("/{key:path}", response_model=HLLSetRetrieveResponse)
def retrieve_hllset(key: str, store: RedisStore = Depends(get_redis_store)):
    result = hllset_service.retrieve_hllset(store, key)
    return result


@router.post("/operation", response_model=HLLSetOperationResponse)
def hllset_operation(body: HLLSetOperationRequest, store: RedisStore = Depends(get_redis_store)):
    try:
        result = hllset_service.set_operation(store, body.operation, body.keys, body.result_key)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
