from pydantic import BaseModel, Field


# ---- MySQL ----

class MySQLMetadataRequest(BaseModel):
    host: str = "localhost"
    port: int = 3306
    user: str
    password: str
    database: str
    table: str = ""
    prompt: str = ""
    db_type: str = "mysql"
    schema_name: str = ""


# ---- MSSQL ----

class MSSQLMetadataRequest(BaseModel):
    host: str = "localhost"
    port: int = 1433
    user: str
    password: str
    database: str
    table: str
    schema_name: str = "dbo"


# ---- CSV ----

class CSVMetadataRequest(BaseModel):
    content: str
    file_name: str = "data.csv"


# ---- Document ----

class DocumentMetadataRequest(BaseModel):
    content: str
    file_name: str = "document.txt"


# ---- Combined ----

class CombinedMetadataRequest(BaseModel):
    prompt: str = ""
    mysql: MySQLMetadataRequest | None = None
    mssql: MSSQLMetadataRequest | None = None
    csv: CSVMetadataRequest | None = None
    document: DocumentMetadataRequest | None = None


# ---- Response ----

class ColumnMeta(BaseModel):
    name: str
    data_type: str | None = None
    inferred_type: str | None = None
    nullable: bool | None = None
    key: str | None = None
    default: str | None = None
    max_length: int | None = None
    precision: int | None = None
    scale: int | None = None
    comment: str | None = None
    position: int | None = None
    null_count_sample: int | None = None
    unique_count_sample: int | None = None
    sample_size: int | None = None


class ForeignKeyMeta(BaseModel):
    column: str
    references_table: str
    references_column: str
    constraint: str | None = None


class TableSummary(BaseModel):
    table: str
    row_count: int | None = None
    data_length: int | None = None
    index_length: int | None = None
    engine: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    comment: str | None = None
    column_count: int | None = None
    columns: list[ColumnMeta] = []
    foreign_keys: list[ForeignKeyMeta] = []


class SourceMetadata(BaseModel):
    source_type: str
    file_name: str | None = None
    database: str | None = None
    table: str | None = None
    doc_type: str | None = None
    row_count: int | None = None
    column_count: int | None = None
    file_size: int | None = None
    delimiter: str | None = None
    line_count: int | None = None
    word_count: int | None = None
    char_count: int | None = None
    avg_line_length: float | None = None
    data_length: int | None = None
    index_length: int | None = None
    created_at: str | None = None
    updated_at: str | None = None
    table_comment: str | None = None
    columns: list[ColumnMeta] = []
    indexes: list[dict] | None = None
    top_words: dict | None = None
    structure: dict | None = None
    # DB-level fields (when table is omitted)
    table_count: int | None = None
    total_rows: int | None = None
    total_size_bytes: int | None = None
    tables: list[TableSummary] | None = None
    prompt: str | None = None
    filter_keywords: list[str] | None = None


class CombinedMetadataResponse(BaseModel):
    prompt: str = ""
    sources: list[SourceMetadata] = []
    errors: list[dict] = []


# ---- Persist / Store ----

class PersistMetadataRequest(BaseModel):
    """Request to persist collected metadata into Redis."""
    metadata: dict  # A SourceMetadata dict


class IngestMetadataRequest(BaseModel):
    """Request to ingest tokens from collected metadata sources."""
    sources: list[dict]  # List of SourceMetadata dicts
    P: int = 10  # HLL precision


class StoredMetadataSummary(BaseModel):
    sha1: str
    source_type: str
    database: str | None = None
    table: str | None = None
    file_name: str | None = None
    table_count: int | None = None
    row_count: int | None = None
    column_count: int | None = None
    stored_at: str | None = None


# ---- AI Analysis ----

class AnalyzeMetadataRequest(BaseModel):
    prompt: str
    metadata: list[dict]
    model: str = "claude-sonnet-4-20250514"


class AnalyzeMetadataResponse(BaseModel):
    analysis: str
    model: str
    usage: dict = {}
