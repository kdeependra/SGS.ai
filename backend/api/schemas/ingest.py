from pydantic import BaseModel


class IngestRequest(BaseModel):
    location_tokens: list[str]
    dataset_tokens: list[str]


class IngestResponse(BaseModel):
    location_key: str
    dataset_key: str


class CommitRequest(BaseModel):
    location_key: str
    dataset_key: str
    label: str = "id"
    metadata: dict | None = None


class CommitResponse(BaseModel):
    status: str
    commit_id: str
    edge_key: str
    location_key: str
    dataset_key: str


class CommitInfo(BaseModel):
    commit_id: str
    timestamp: int
    edge_key: str


class CommitListResponse(BaseModel):
    commits: list[CommitInfo]
