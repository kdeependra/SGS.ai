from pydantic import BaseModel, Field


class DatabaseCreate(BaseModel):
    db_name: str
    db_type: str = "postgresql"
    host: str = "localhost"
    port: int = 5432


class DatabaseResponse(BaseModel):
    sha1: str
    db_name: str
    db_type: str
    host: str
    port: int


class DatabaseHierarchy(BaseModel):
    sha1: str
    db_name: str
    db_type: str
    tables: list["TableInfo"] = []


class TableCreate(BaseModel):
    table_name: str
    db_sha1: str
    schema_name: str = "public"
    row_count: int = 0


class TableInfo(BaseModel):
    sha1: str
    table_name: str
    schema_name: str
    row_count: int = 0
    columns: list["ColumnInfo"] = []


class TableResponse(BaseModel):
    sha1: str
    table_name: str
    db_sha1: str
    schema_name: str
    row_count: int = 0


class ColumnLoad(BaseModel):
    column_name: str
    table_sha1: str
    db_sha1: str
    values: list[str]
    data_type: str = "varchar"
    nullable: bool = True


class ColumnBatchLoad(BaseModel):
    columns: list[ColumnLoad]


class ColumnInfo(BaseModel):
    sha1: str
    column_name: str
    data_type: str
    cardinality: int = 0
    nullable: bool = True


class ColumnResponse(BaseModel):
    sha1: str
    column_name: str
    table_sha1: str
    db_sha1: str
    cardinality: int = 0


class ColumnBatchResponse(BaseModel):
    columns: list[ColumnResponse]


class ColumnStats(BaseModel):
    sha1: str
    column_name: str
    cardinality: int
    selectivity: float
    data_type: str
    nullable: bool
    hll_size: int = 0
