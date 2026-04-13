from fastapi import APIRouter, Depends, HTTPException
from api.schemas.ingest import (
    IngestRequest, IngestResponse,
    CommitRequest, CommitResponse,
    CommitInfo, CommitListResponse,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import ingest_service

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])


@router.post("", response_model=IngestResponse)
def ingest(body: IngestRequest, store: RedisStore = Depends(get_redis_store)):
    result = ingest_service.ingest(store, body.location_tokens, body.dataset_tokens)
    return result


@router.post("/commit", response_model=CommitResponse)
def commit(body: CommitRequest, store: RedisStore = Depends(get_redis_store)):
    try:
        result = ingest_service.commit(store, body.location_key, body.dataset_key, body.label, body.metadata)
        return result
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/commits", response_model=CommitListResponse)
def list_commits(store: RedisStore = Depends(get_redis_store)):
    commits = ingest_service.list_commits(store)
    return {"commits": commits}


@router.get("/commits/{commit_id}", response_model=CommitInfo)
def get_commit(commit_id: str, store: RedisStore = Depends(get_redis_store)):
    result = ingest_service.get_commit(store, commit_id)
    if not result:
        raise HTTPException(status_code=404, detail="Commit not found")
    return result
