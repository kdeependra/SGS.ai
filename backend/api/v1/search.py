from fastapi import APIRouter, Depends, HTTPException
from api.schemas.search import (
    PromptRequest, PromptResponse,
    TokenLookupRequest, TokenLookupResponse,
    TokenResolveRequest, TokenResolveResponse,
    RawSearchRequest, RawSearchResponse,
    NlpSearchRequest, NlpSearchResponse,
    SyncGraphResponse,
)
from dependencies import get_redis_store
from core.meta_redis import RedisStore
from services import search_service
from services import nlp_search_service

router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.post("/prompt", response_model=PromptResponse)
def search_prompt(body: PromptRequest, store: RedisStore = Depends(get_redis_store)):
    result = search_service.hierarchical_match(store, body.prompt, body.thresholds)
    return result


@router.post("/tokens/lookup", response_model=TokenLookupResponse)
def token_lookup(body: TokenLookupRequest, store: RedisStore = Depends(get_redis_store)):
    results = search_service.lookup_token_refs(store, body.tokens)
    return {"results": results}


@router.post("/tokens/resolve", response_model=TokenResolveResponse)
def token_resolve(body: TokenResolveRequest, store: RedisStore = Depends(get_redis_store)):
    compounds = search_service.resolve_compound_sources(store, body.leaf_refs)
    return {"compounds": compounds}


@router.post("/raw", response_model=RawSearchResponse)
def raw_search(body: RawSearchRequest, store: RedisStore = Depends(get_redis_store)):
    result = search_service.raw_search(store, body.index_name, body.query)
    return result


@router.post("/nlp", response_model=NlpSearchResponse)
def nlp_search(body: NlpSearchRequest, store: RedisStore = Depends(get_redis_store)):
    """Convert natural language prompt to Cypher, execute against RedisGraph, return results + graph."""
    try:
        result = nlp_search_service.nlp_search(store, body.prompt)
        return result
    except Exception as e:
        msg = str(e)
        if "overloaded" in msg.lower() or "529" in msg:
            raise HTTPException(status_code=503, detail="AI service is temporarily overloaded. Please try again in a few seconds.")
        raise HTTPException(status_code=500, detail=msg)


@router.post("/graph/sync", response_model=SyncGraphResponse)
def sync_graph(store: RedisStore = Depends(get_redis_store)):
    """Sync metadata from Redis hashes into RedisGraph for Cypher queries."""
    result = nlp_search_service.sync_metadata_to_graph(store)
    return result
