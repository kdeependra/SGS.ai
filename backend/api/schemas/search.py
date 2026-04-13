from __future__ import annotations
from pydantic import BaseModel


class PromptRequest(BaseModel):
    prompt: str
    thresholds: dict[str, float] | None = None


class MatchResultResponse(BaseModel):
    sha1: str
    level: str
    name: str
    score: float
    parent_sha1: str | None = None
    children: list[MatchResultResponse] = []


class SQLCandidate(BaseModel):
    sql: str
    db: str
    table: str
    columns: list[str]
    confidence: float


class PromptResponse(BaseModel):
    tokens: list[str]
    matches: list[MatchResultResponse]
    sql_candidates: list[SQLCandidate]
    other_sources: dict[str, list[str]] = {}


class TokenLookupRequest(BaseModel):
    tokens: list[str]


class TokenLookupResponse(BaseModel):
    results: dict[str, dict[str, list[str]]]


class TokenResolveRequest(BaseModel):
    leaf_refs: list[str]


class TokenResolveResponse(BaseModel):
    compounds: list[dict]


class RawSearchRequest(BaseModel):
    index_name: str
    query: str


class RawSearchResponse(BaseModel):
    total: int
    docs: list[dict]


class NlpSearchRequest(BaseModel):
    prompt: str


class NlpCypherResult(BaseModel):
    columns: list[str] = []
    rows: list[list] = []
    stats: str = ""
    error: str | None = None


class NlpGraphNode(BaseModel):
    id: str
    type: str
    label: str


class NlpGraphEdge(BaseModel):
    source: str
    target: str
    label: str


class NlpGraph(BaseModel):
    nodes: list[NlpGraphNode] = []
    edges: list[NlpGraphEdge] = []


class NlpSearchResponse(BaseModel):
    prompt: str
    cypher: str
    result: NlpCypherResult
    graph: NlpGraph


class SyncGraphResponse(BaseModel):
    nodes_created: int
    edges_created: int
    status: str
