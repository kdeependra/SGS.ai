from fastapi import APIRouter, Depends
from api.schemas.graph import (
    GraphQueryRequest, GraphQueryResponse,
    BitmapCommandRequest, BitmapCommandResponse,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import graph_service

router = APIRouter(prefix="/api/v1", tags=["graph & bitmap"])


@router.get("/graph/metadata")
def metadata_graph(store: RedisStore = Depends(get_redis_store)):
    return graph_service.get_metadata_graph(store)


@router.post("/graph/query", response_model=GraphQueryResponse)
def graph_query(body: GraphQueryRequest, store: RedisStore = Depends(get_redis_store)):
    result = graph_service.execute_graph_query(store, body.query)
    return {"result": result}


@router.post("/bitmap/command", response_model=BitmapCommandResponse)
def bitmap_command(body: BitmapCommandRequest, store: RedisStore = Depends(get_redis_store)):
    result = graph_service.roaring_bitmap_command(store, body.command, body.args)
    return {"result": result}
