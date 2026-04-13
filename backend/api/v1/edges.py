from fastapi import APIRouter, Depends, Query
from api.schemas.edge import (
    EdgeCreate, EdgeResponse, EdgeArchiveRequest, EdgeArchiveResponse,
    SimilarityResult, EdgeSearchResponse,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import edge_service

router = APIRouter(prefix="/api/v1/edges", tags=["edges"])


@router.post("", response_model=EdgeResponse)
def create_edge(body: EdgeCreate, store: RedisStore = Depends(get_redis_store)):
    result = edge_service.create_edge(store, body.left, body.right, body.label, body.attr)
    return result


@router.post("/archive", response_model=EdgeArchiveResponse)
def archive_edges(body: EdgeArchiveRequest, store: RedisStore = Depends(get_redis_store)):
    count = edge_service.archive_edges(store, body.entity_sha1)
    return {"archived_count": count}


@router.get("", response_model=EdgeSearchResponse)
def search_edges_route(state: str = Query("head"), store: RedisStore = Depends(get_redis_store)):
    edges = edge_service.search_edges(store, state)
    return {"edges": edges}


@router.get("/similar/{column_sha1}", response_model=list[SimilarityResult])
def similar_columns(column_sha1: str, store: RedisStore = Depends(get_redis_store)):
    return edge_service.find_similar_columns(store, column_sha1)
