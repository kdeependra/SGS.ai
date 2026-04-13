from pydantic import BaseModel


class GraphQueryRequest(BaseModel):
    query: str


class GraphQueryResponse(BaseModel):
    result: list


class BitmapCommandRequest(BaseModel):
    command: str
    args: list[str] = []


class BitmapCommandResponse(BaseModel):
    result: str | int | list | None
