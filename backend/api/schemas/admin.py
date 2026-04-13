from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    redis_connected: bool
    write_read_ok: bool
    latency: list | None = None
    modules: list[str] = []


class IndexInfo(BaseModel):
    name: str
    num_docs: int = 0
    fields: list[str] = []


class IndicesListResponse(BaseModel):
    indices: list[IndexInfo]


class CleanupRequest(BaseModel):
    prefix: str
    confirm: bool = False


class CleanupResponse(BaseModel):
    deleted_count: int
    prefix: str
