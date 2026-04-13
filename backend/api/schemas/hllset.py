from pydantic import BaseModel, field_validator


class HLLSetStoreRequest(BaseModel):
    key: str
    values: list[str]


class HLLSetStoreResponse(BaseModel):
    key: str
    cardinality: int


class HLLSetRetrieveResponse(BaseModel):
    key: str
    cardinality: int
    exists: bool


class HLLSetOperationRequest(BaseModel):
    operation: str
    keys: list[str]
    result_key: str

    @field_validator("operation")
    @classmethod
    def validate_operation(cls, v: str) -> str:
        allowed = {"union", "intersection", "difference"}
        if v not in allowed:
            raise ValueError(f"operation must be one of {allowed}")
        return v

    @field_validator("keys")
    @classmethod
    def validate_keys_length(cls, v: list[str]) -> list[str]:
        if len(v) != 2:
            raise ValueError("Exactly 2 source keys required")
        return v


class HLLSetOperationResponse(BaseModel):
    result_key: str
    cardinality: int
