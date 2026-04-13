from pydantic import BaseModel


class EdgeCreate(BaseModel):
    left: str
    right: str
    label: str = "id"
    attr: dict | None = None


class EdgeResponse(BaseModel):
    key: str
    e_sha1: str
    label: str
    left: str
    right: str
    attr: str = ""
    timestamp: int = 0
    state: str = "head"


class EdgeArchiveRequest(BaseModel):
    entity_sha1: str


class EdgeArchiveResponse(BaseModel):
    archived_count: int


class SimilarityResult(BaseModel):
    sha1: str
    column_name: str
    jaccard: float


class EdgeSearchResponse(BaseModel):
    edges: list[EdgeResponse]
