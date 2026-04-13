"""Persist collected MCP metadata into Redis.

Bridges the gap between MCP metadata collection and Redis storage.
Takes SourceMetadata dicts (from MCP) and stores them using the
existing source_service pipeline:
    DB → meta:db:{sha1}
    Table → meta:table:{sha1}
    Column → meta:column:{sha1} + hll:col:{sha1}
    CSV/Document → meta:file:{sha1}
"""
import json
import time
from core.meta_redis import RedisStore
from core.hashing import generate_content_hash
from services import source_service
from services import redis_admin_service


# ---------------------------------------------------------------------------
# Database-level metadata (MySQL / MSSQL)
# ---------------------------------------------------------------------------

def persist_db_metadata(store: RedisStore, source: dict) -> dict:
    """Persist a full database-level SourceMetadata dict into Redis.

    Works for both single-table and DB-overview responses.
    Returns summary with SHA1 keys for everything stored.
    """
    source_type = source.get("source_type", "mysql")
    database = source.get("database", "")
    host = source.get("host", "localhost")
    port = source.get("port", 3306)

    # 1. Register the database
    db_result = source_service.register_database(
        store, db_name=database, db_type=source_type,
        host=host, port=int(port),
    )
    db_sha1 = db_result["sha1"]

    stored_tables = []

    # Case A: DB-level overview with tables list
    tables = source.get("tables") or []
    if tables:
        for t in tables:
            t_result = _persist_table(store, t, db_sha1)
            stored_tables.append(t_result)

    # Case B: Single-table response
    table_name = source.get("table")
    columns = source.get("columns") or []
    if table_name and columns:
        single = {
            "table": table_name,
            "row_count": source.get("row_count", 0),
            "columns": columns,
            "foreign_keys": [],
        }
        t_result = _persist_table(store, single, db_sha1)
        stored_tables.append(t_result)

    # Store a snapshot of the full metadata as JSON for retrieval
    snapshot_key = f"meta:snapshot:{db_sha1}"
    store.redis.set(snapshot_key, json.dumps(source, default=str))

    return {
        "db_sha1": db_sha1,
        "database": database,
        "tables_stored": len(stored_tables),
        "tables": stored_tables,
    }


def _persist_table(store: RedisStore, table_dict: dict, db_sha1: str) -> dict:
    """Register a single table and its columns in Redis."""
    table_name = table_dict.get("table", "")
    row_count = table_dict.get("row_count") or 0
    schema_name = table_dict.get("schema_name", "public")

    t_result = source_service.register_table(
        store, table_name=table_name, db_sha1=db_sha1,
        schema_name=schema_name, row_count=int(row_count),
    )
    table_sha1 = t_result["sha1"]

    stored_cols = []
    columns = table_dict.get("columns") or []
    for col in columns:
        col_name = col.get("name", "")
        data_type = col.get("data_type", "varchar")
        nullable = col.get("nullable", True)
        if isinstance(nullable, str):
            nullable = nullable.lower() in ("yes", "true", "1")

        col_sha1 = generate_content_hash(col_name, table_sha1, db_sha1)
        # Store column metadata (without HLL — we don't have row values)
        store.redis.hset(f"meta:column:{col_sha1}", mapping={
            "column_name": col_name,
            "table_sha1": table_sha1,
            "db_sha1": db_sha1,
            "data_type": data_type,
            "nullable": str(nullable),
            "cardinality": "0",
            "key": col.get("key", ""),
        })
        # Update parent table
        tbl_key = f"meta:table:{table_sha1}"
        raw = store.redis.hget(tbl_key, "columns")
        cols = json.loads(raw.decode()) if raw else []
        if col_sha1 not in cols:
            cols.append(col_sha1)
            store.redis.hset(tbl_key, "columns", json.dumps(cols))

        stored_cols.append({"sha1": col_sha1, "column_name": col_name})

    # Store foreign keys as table attribute
    fks = table_dict.get("foreign_keys") or []
    if fks:
        store.redis.hset(f"meta:table:{table_sha1}", "foreign_keys", json.dumps(fks))

    # Store extra table metadata
    extra = {}
    for field in ("engine", "data_length", "index_length", "created_at",
                  "updated_at", "comment", "column_count"):
        val = table_dict.get(field)
        if val is not None:
            extra[field] = str(val)
    if extra:
        store.redis.hset(f"meta:table:{table_sha1}", mapping=extra)

    return {
        "sha1": table_sha1,
        "table": table_name,
        "columns_stored": len(stored_cols),
        "columns": stored_cols,
    }


# ---------------------------------------------------------------------------
# File-level metadata (CSV / Document)
# ---------------------------------------------------------------------------

def persist_file_metadata(store: RedisStore, source: dict) -> dict:
    """Persist a CSV or Document SourceMetadata dict into Redis.

    For CSV files with columns, also creates meta:table and meta:column
    entries so they appear in the graph and search alongside database tables.
    """
    source_type = source.get("source_type", "file")
    file_name = source.get("file_name", "unknown")
    file_sha1 = generate_content_hash(file_name, source_type)
    key = f"meta:file:{file_sha1}"

    mapping = {
        "file_name": file_name,
        "source_type": source_type,
        "stored_at": str(time.time()),
    }
    # Copy known scalar fields
    for field in ("row_count", "column_count", "file_size", "delimiter",
                  "line_count", "word_count", "char_count", "doc_type"):
        val = source.get(field)
        if val is not None:
            mapping[field] = str(val)

    # Store columns as JSON array
    columns = source.get("columns") or []
    if columns:
        mapping["columns"] = json.dumps(columns)

    # Store extra dicts as JSON
    for dict_field in ("top_words", "structure", "indexes"):
        val = source.get(dict_field)
        if val:
            mapping[dict_field] = json.dumps(val)

    store.redis.hset(key, mapping=mapping)

    # --- For CSV files with columns, create table/column hierarchy ---
    stored_tables = []
    if source_type == "csv" and columns:
        # Use file_sha1 as the parent reference for CSV tables
        db_sha1 = file_sha1

        # Use tables from metadata if available, otherwise derive from filename
        csv_tables = source.get("tables") or []
        if csv_tables:
            # Use pre-built tables with filename-based naming (e.g. data_1)
            for tbl in csv_tables:
                table_name = tbl.get("table", "")
                tbl_columns = tbl.get("columns") or columns
                if not table_name:
                    base_name = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
                    table_name = f"{base_name}_1"

                table_sha1 = generate_content_hash(table_name, db_sha1, "csv")
                tbl_key = f"meta:table:{table_sha1}"

                store.redis.hset(tbl_key, mapping={
                    "table_name": table_name,
                    "db_sha1": db_sha1,
                    "schema_name": "csv",
                    "row_count": str(tbl.get("row_count", source.get("row_count", 0))),
                    "column_count": str(len(tbl_columns)),
                    "engine": "csv",
                })

                col_sha1_list = []
                stored_cols = []
                for col in tbl_columns:
                    col_name = col.get("name", "")
                    if not col_name:
                        continue
                    data_type = col.get("data_type") or col.get("inferred_type") or "string"
                    col_sha1 = generate_content_hash(col_name, table_sha1, db_sha1)

                    store.redis.hset(f"meta:column:{col_sha1}", mapping={
                        "column_name": col_name,
                        "table_sha1": table_sha1,
                        "db_sha1": db_sha1,
                        "data_type": data_type,
                        "nullable": str(col.get("nullable") if col.get("nullable") is not None else True),
                        "cardinality": str(col.get("unique_count_sample") or 0),
                        "key": col.get("key") or "",
                    })
                    col_sha1_list.append(col_sha1)
                    stored_cols.append({"sha1": col_sha1, "column_name": col_name})

                store.redis.hset(tbl_key, "columns", json.dumps(col_sha1_list))

                stored_tables.append({
                    "sha1": table_sha1,
                    "table": table_name,
                    "columns_stored": len(stored_cols),
                    "columns": stored_cols,
                })
        else:
            # Fallback: derive table name from file name with _1 suffix
            base_name = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
            table_name = f"{base_name}_1"
            table_sha1 = generate_content_hash(table_name, db_sha1, "csv")
            tbl_key = f"meta:table:{table_sha1}"

            store.redis.hset(tbl_key, mapping={
                "table_name": table_name,
                "db_sha1": db_sha1,
                "schema_name": "csv",
                "row_count": str(source.get("row_count", 0)),
                "column_count": str(len(columns)),
                "engine": "csv",
            })

            col_sha1_list = []
            stored_cols = []
            for col in columns:
                col_name = col.get("name", "")
                if not col_name:
                    continue
                data_type = col.get("data_type") or col.get("inferred_type") or "string"
                col_sha1 = generate_content_hash(col_name, table_sha1, db_sha1)

                store.redis.hset(f"meta:column:{col_sha1}", mapping={
                    "column_name": col_name,
                    "table_sha1": table_sha1,
                    "db_sha1": db_sha1,
                    "data_type": data_type,
                    "nullable": str(col.get("nullable") if col.get("nullable") is not None else True),
                    "cardinality": str(col.get("unique_count_sample") or 0),
                    "key": col.get("key") or "",
                })
                col_sha1_list.append(col_sha1)
                stored_cols.append({"sha1": col_sha1, "column_name": col_name})

            store.redis.hset(tbl_key, "columns", json.dumps(col_sha1_list))

            stored_tables.append({
                "sha1": table_sha1,
                "table": table_name,
                "columns_stored": len(stored_cols),
                "columns": stored_cols,
            })

    # --- For document files, extract structure into table/column hierarchy ---
    if source_type == "document":
        structure = source.get("structure") or {}
        doc_type = source.get("doc_type", "plaintext")
        db_sha1 = file_sha1

        # Derive base table name from file name (strip extension)
        base_name = file_name.rsplit(".", 1)[0] if "." in file_name else file_name

        # Priority 1: Use extracted tabular data from document content
        extracted_tables = source.get("tables") or []
        if extracted_tables:
            for idx, tbl in enumerate(extracted_tables, 1):
                tbl_name = tbl.get("table", "")
                # Use filename-based naming: filename_1, filename_2, ...
                if not tbl_name or tbl_name.startswith("table_") or tbl_name == "data":
                    tbl_name = f"{base_name}_{idx}"
                tbl_columns = tbl.get("columns") or []
                if not tbl_columns:
                    continue

                table_sha1 = generate_content_hash(tbl_name, db_sha1, "document")
                tbl_key = f"meta:table:{table_sha1}"

                store.redis.hset(tbl_key, mapping={
                    "table_name": tbl_name,
                    "db_sha1": db_sha1,
                    "schema_name": "document",
                    "row_count": str(tbl.get("row_count", 0)),
                    "column_count": str(len(tbl_columns)),
                    "engine": doc_type,
                })

                col_sha1_list = []
                stored_cols = []
                for col in tbl_columns:
                    col_name = col.get("name", "")
                    if not col_name:
                        continue
                    data_type = col.get("data_type", "string")
                    col_sha1 = generate_content_hash(col_name, table_sha1, db_sha1)

                    store.redis.hset(f"meta:column:{col_sha1}", mapping={
                        "column_name": col_name,
                        "table_sha1": table_sha1,
                        "db_sha1": db_sha1,
                        "data_type": data_type,
                        "nullable": str(col.get("nullable", True)),
                        "cardinality": "0",
                        "key": "",
                    })
                    col_sha1_list.append(col_sha1)
                    stored_cols.append({"sha1": col_sha1, "column_name": col_name})

                store.redis.hset(tbl_key, "columns", json.dumps(col_sha1_list))

                stored_tables.append({
                    "sha1": table_sha1,
                    "table": tbl_name,
                    "columns_stored": len(stored_cols),
                    "columns": stored_cols,
                })

        # Priority 2: Fall back to structural hints if no tabular data found
        if not stored_tables:
            doc_columns = []
            if doc_type == "json" and structure.get("top_level_keys"):
                for k in structure["top_level_keys"]:
                    doc_columns.append({"name": k, "data_type": "json_key"})
            elif doc_type == "markdown" and structure.get("headings"):
                for h in structure["headings"]:
                    doc_columns.append({
                        "name": h.get("text", ""),
                        "data_type": f"heading_h{h.get('level', 1)}",
                    })
            elif doc_type in ("xml", "html") and structure.get("tag_counts"):
                for tag, count in structure["tag_counts"].items():
                    doc_columns.append({"name": tag, "data_type": f"tag (count: {count})"})

            if doc_columns:
                table_name = base_name
                table_sha1 = generate_content_hash(table_name, db_sha1, "document")
                tbl_key = f"meta:table:{table_sha1}"

                store.redis.hset(tbl_key, mapping={
                    "table_name": table_name,
                    "db_sha1": db_sha1,
                    "schema_name": "document",
                    "row_count": str(source.get("line_count", 0)),
                    "column_count": str(len(doc_columns)),
                    "engine": doc_type,
                })

                col_sha1_list = []
                stored_cols = []
                for col in doc_columns:
                    col_name = col.get("name", "")
                    if not col_name:
                        continue
                    data_type = col.get("data_type", "string")
                    col_sha1 = generate_content_hash(col_name, table_sha1, db_sha1)

                    store.redis.hset(f"meta:column:{col_sha1}", mapping={
                        "column_name": col_name,
                        "table_sha1": table_sha1,
                        "db_sha1": db_sha1,
                        "data_type": data_type,
                        "nullable": "True",
                        "cardinality": "0",
                        "key": "",
                    })
                    col_sha1_list.append(col_sha1)
                    stored_cols.append({"sha1": col_sha1, "column_name": col_name})

                store.redis.hset(tbl_key, "columns", json.dumps(col_sha1_list))

                stored_tables.append({
                    "sha1": table_sha1,
                    "table": table_name,
                    "columns_stored": len(stored_cols),
                    "columns": stored_cols,
                })

    # Store a snapshot of the full metadata
    snapshot_key = f"meta:snapshot:{file_sha1}"
    store.redis.set(snapshot_key, json.dumps(source, default=str))

    result = {
        "sha1": file_sha1,
        "file_name": file_name,
        "source_type": source_type,
    }
    if stored_tables:
        result["tables_stored"] = len(stored_tables)
        result["tables"] = stored_tables
    return result


# ---------------------------------------------------------------------------
# Unified dispatcher
# ---------------------------------------------------------------------------

def persist_metadata(store: RedisStore, source: dict) -> dict:
    """Persist any SourceMetadata dict into Redis.

    Dispatches to the appropriate handler based on source_type.
    """
    source_type = source.get("source_type", "")
    if source_type in ("mysql", "mssql"):
        return persist_db_metadata(store, source)
    elif source_type in ("csv", "document"):
        return persist_file_metadata(store, source)
    else:
        raise ValueError(f"Unknown source_type: {source_type}")


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def list_stored_metadata(store: RedisStore) -> list[dict]:
    """List all stored metadata snapshots."""
    results = []
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:snapshot:*", count=100)
        for k in keys:
            raw = store.redis.get(k)
            if raw:
                data = json.loads(raw.decode())
                sha1 = k.decode().split(":")[-1]
                results.append({
                    "sha1": sha1,
                    "source_type": data.get("source_type", ""),
                    "database": data.get("database"),
                    "table": data.get("table"),
                    "file_name": data.get("file_name"),
                    "table_count": data.get("table_count"),
                    "row_count": data.get("row_count"),
                    "column_count": data.get("column_count"),
                    "stored_at": data.get("stored_at"),
                })
        if cursor == 0:
            break
    return results


def get_stored_metadata(store: RedisStore, sha1: str) -> dict | None:
    """Retrieve a full stored metadata snapshot by SHA1."""
    raw = store.redis.get(f"meta:snapshot:{sha1}")
    if not raw:
        return None
    data = json.loads(raw.decode())
    data["sha1"] = sha1
    return data


def delete_stored_metadata(store: RedisStore, sha1: str) -> bool:
    """Delete a stored metadata snapshot and its Redis keys."""
    snapshot_key = f"meta:snapshot:{sha1}"
    raw = store.redis.get(snapshot_key)
    if not raw:
        return False

    data = json.loads(raw.decode())
    pipe = store.redis.pipeline()

    # Clean up related keys
    source_type = data.get("source_type", "")
    if source_type in ("mysql", "mssql"):
        # Remove db, table, column keys
        pipe.delete(f"meta:db:{sha1}")
        tables = data.get("tables") or []
        for t in tables:
            t_name = t.get("table", "")
            t_sha1 = generate_content_hash(t_name, sha1, t.get("schema_name", "public"))
            pipe.delete(f"meta:table:{t_sha1}")
            for col in (t.get("columns") or []):
                c_sha1 = generate_content_hash(col.get("name", ""), t_sha1, sha1)
                pipe.delete(f"meta:column:{c_sha1}")
    elif source_type in ("csv", "document"):
        pipe.delete(f"meta:file:{sha1}")

    pipe.delete(snapshot_key)
    pipe.execute()
    return True


# ---------------------------------------------------------------------------
# Ingest metadata tokens into Redis
# ---------------------------------------------------------------------------

def ingest_all_metadata(store: RedisStore, sources: list[dict], P: int = 10) -> dict:
    """Extract tokens from all collected sources and ingest them via ingest_tokens.

    For each source, determines the leaf source_sha1, source_type, tokens,
    and parent_chain, then calls redis_admin_service.ingest_tokens().

    Database sources (mysql/mssql):
        - Each column is a leaf.  tokens = [column_name]
        - source_sha1 = column SHA1
        - source_type = "database"
        - parent_chain = [(table_sha1, table, contains_column),
                          (db_sha1, db, contains_table)]

    CSV sources:
        - Each column is a leaf.  tokens = [column_name]
        - source_sha1 = file SHA1
        - source_type = file_name (csv path)

    Document sources:
        - Tokens = top-word keys or extracted words
        - source_sha1 = file SHA1
        - source_type = "document"
    """
    results = []

    for source in sources:
        source_type = source.get("source_type", "")
        if source_type in ("mysql", "mssql"):
            results.append(_ingest_db_metadata(store, source, P))
        elif source_type == "csv":
            results.append(_ingest_csv_metadata(store, source, P))
        elif source_type == "document":
            results.append(_ingest_doc_metadata(store, source, P))
        else:
            results.append({"source_type": source_type, "error": f"Unknown source_type: {source_type}"})

    total_tokens = sum(r.get("tokens_ingested", 0) for r in results)
    total_edges = sum(r.get("edges_created", 0) for r in results)
    return {
        "sources_processed": len(results),
        "total_tokens_ingested": total_tokens,
        "total_edges_created": total_edges,
        "details": results,
    }


def _ingest_db_metadata(store: RedisStore, source: dict, P: int) -> dict:
    """Ingest tokens from a database source (mysql/mssql)."""
    from utils.tokenizer import tokenize_name

    database = source.get("database", "")
    host = source.get("host", "localhost")
    port = source.get("port", 3306)
    db_sha1 = generate_content_hash(database, source.get("source_type", "mysql"), host, str(port))

    tokens_ingested = 0
    edges_created = 0
    tables_processed = 0

    # Index database name as tokens
    db_tokens = tokenize_name(database)
    if db_tokens:
        result = redis_admin_service.ingest_tokens(
            store, tokens=db_tokens, source_sha1=db_sha1,
            source_type="database", parent_chain=[], P=P,
        )
        tokens_ingested += result["tokens_indexed"]

    # DB-level overview with tables list
    tables = source.get("tables") or []
    if tables:
        for t in tables:
            table_name = t.get("table", "")
            schema_name = t.get("schema_name", "public")
            table_sha1 = generate_content_hash(table_name, db_sha1, schema_name)

            # Index table name as tokens
            table_tokens = tokenize_name(table_name)
            if table_tokens:
                result = redis_admin_service.ingest_tokens(
                    store, tokens=table_tokens, source_sha1=table_sha1,
                    source_type="table", parent_chain=[
                        {"parent_sha1": db_sha1, "parent_type": "db", "edge_label": "contains_table"},
                    ], P=P,
                )
                tokens_ingested += result["tokens_indexed"]
                edges_created += len(result["edges_created"])

            columns = t.get("columns") or []
            for col in columns:
                col_name = col.get("name", "")
                col_sha1 = generate_content_hash(col_name, table_sha1, db_sha1)
                # Tokenize column name into searchable words
                col_tokens = tokenize_name(col_name)
                if not col_tokens:
                    col_tokens = [col_name]  # fallback to raw name
                parent_chain = [
                    {"parent_sha1": table_sha1, "parent_type": "table", "edge_label": "contains_column"},
                    {"parent_sha1": db_sha1, "parent_type": "db", "edge_label": "contains_table"},
                ]
                result = redis_admin_service.ingest_tokens(
                    store, tokens=col_tokens, source_sha1=col_sha1,
                    source_type="column", parent_chain=parent_chain, P=P,
                )
                tokens_ingested += result["tokens_indexed"]
                edges_created += len(result["edges_created"])
            tables_processed += 1

    # Single-table response
    table_name = source.get("table")
    columns = source.get("columns") or []
    if table_name and columns and not tables:
        schema_name = source.get("schema_name", "public")
        table_sha1 = generate_content_hash(table_name, db_sha1, schema_name)

        # Index table name as tokens
        table_tokens = tokenize_name(table_name)
        if table_tokens:
            result = redis_admin_service.ingest_tokens(
                store, tokens=table_tokens, source_sha1=table_sha1,
                source_type="table", parent_chain=[
                    {"parent_sha1": db_sha1, "parent_type": "db", "edge_label": "contains_table"},
                ], P=P,
            )
            tokens_ingested += result["tokens_indexed"]
            edges_created += len(result["edges_created"])

        for col in columns:
            col_name = col.get("name", "")
            col_sha1 = generate_content_hash(col_name, table_sha1, db_sha1)
            col_tokens = tokenize_name(col_name)
            if not col_tokens:
                col_tokens = [col_name]
            parent_chain = [
                {"parent_sha1": table_sha1, "parent_type": "table", "edge_label": "contains_column"},
                {"parent_sha1": db_sha1, "parent_type": "db", "edge_label": "contains_table"},
            ]
            result = redis_admin_service.ingest_tokens(
                store, tokens=col_tokens, source_sha1=col_sha1,
                source_type="column", parent_chain=parent_chain, P=P,
            )
            tokens_ingested += result["tokens_indexed"]
            edges_created += len(result["edges_created"])
        tables_processed += 1

    return {
        "source_type": source.get("source_type", "mysql"),
        "database": database,
        "tables_processed": tables_processed,
        "tokens_ingested": tokens_ingested,
        "edges_created": edges_created,
    }


def _ingest_csv_metadata(store: RedisStore, source: dict, P: int) -> dict:
    """Ingest tokens from a CSV source."""
    from utils.tokenizer import tokenize_name

    file_name = source.get("file_name", "unknown.csv")
    file_sha1 = generate_content_hash(file_name, "csv")

    tokens_ingested = 0

    # Index file name as tokens
    file_tokens = tokenize_name(file_name)
    if file_tokens:
        result = redis_admin_service.ingest_tokens(
            store, tokens=file_tokens, source_sha1=file_sha1,
            source_type="file", parent_chain=[], P=P,
        )
        tokens_ingested += result["tokens_indexed"]

    # Index each column name as tokenized words
    columns = source.get("columns") or []
    base_name = file_name.rsplit(".", 1)[0] if "." in file_name else file_name

    # Use tables from metadata if available, otherwise fallback
    csv_tables = source.get("tables") or [{"table": f"{base_name}_1", "columns": columns}]

    for tbl in csv_tables:
        table_name = tbl.get("table", f"{base_name}_1")
        tbl_columns = tbl.get("columns") or columns
        table_sha1 = generate_content_hash(table_name, file_sha1, "csv")

        # Index table name as tokens
        table_tokens = tokenize_name(table_name)
        if table_tokens:
            result = redis_admin_service.ingest_tokens(
                store, tokens=table_tokens, source_sha1=table_sha1,
                source_type="table", parent_chain=[], P=P,
            )
            tokens_ingested += result["tokens_indexed"]

        for col in tbl_columns:
            col_name = col.get("name", "")
            if not col_name:
                continue
            col_sha1 = generate_content_hash(col_name, table_sha1, file_sha1)
            col_tokens = tokenize_name(col_name)
            if not col_tokens:
                col_tokens = [col_name]
            result = redis_admin_service.ingest_tokens(
                store, tokens=col_tokens, source_sha1=col_sha1,
                source_type="column", parent_chain=[], P=P,
            )
            tokens_ingested += result["tokens_indexed"]

    return {
        "source_type": "csv",
        "file_name": file_name,
        "tokens_ingested": tokens_ingested,
        "edges_created": 0,
    }


def _ingest_doc_metadata(store: RedisStore, source: dict, P: int) -> dict:
    """Ingest tokens from a document source."""
    file_name = source.get("file_name", "unknown")
    file_sha1 = generate_content_hash(file_name, "document")

    tokens_ingested = 0

    # Index file name as tokens
    from utils.tokenizer import tokenize_name
    file_tokens = tokenize_name(file_name)
    if file_tokens:
        result = redis_admin_service.ingest_tokens(
            store, tokens=file_tokens, source_sha1=file_sha1,
            source_type="file", parent_chain=[], P=P,
        )
        tokens_ingested += result["tokens_indexed"]

    # Index extracted tables with filename-based naming
    extracted_tables = source.get("tables") or []
    if extracted_tables:
        base_name = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
        for idx, tbl in enumerate(extracted_tables, 1):
            table_name = tbl.get("table", f"{base_name}_{idx}")
            # Ensure filename-based naming
            if table_name.startswith("table_") or table_name == "data":
                table_name = f"{base_name}_{idx}"
            table_sha1 = generate_content_hash(table_name, file_sha1, "document")

            table_tokens = tokenize_name(table_name)
            if table_tokens:
                result = redis_admin_service.ingest_tokens(
                    store, tokens=table_tokens, source_sha1=table_sha1,
                    source_type="table", parent_chain=[], P=P,
                )
                tokens_ingested += result["tokens_indexed"]

            tbl_columns = tbl.get("columns") or []
            for col in tbl_columns:
                col_name = col.get("name", "")
                if not col_name:
                    continue
                col_sha1 = generate_content_hash(col_name, table_sha1, file_sha1)
                col_tokens = tokenize_name(col_name)
                if not col_tokens:
                    col_tokens = [col_name]
                result = redis_admin_service.ingest_tokens(
                    store, tokens=col_tokens, source_sha1=col_sha1,
                    source_type="column", parent_chain=[], P=P,
                )
                tokens_ingested += result["tokens_indexed"]

    # Use top_words if available
    tokens = []
    top_words = source.get("top_words")
    if top_words and isinstance(top_words, dict):
        tokens = list(top_words.keys())
    # Fallback: extract words from content/structure
    if not tokens:
        structure = source.get("structure")
        if structure and isinstance(structure, dict):
            tokens = [str(v) for v in structure.values() if isinstance(v, str)]

    if tokens:
        result = redis_admin_service.ingest_tokens(
            store, tokens=tokens, source_sha1=file_sha1,
            source_type="file", parent_chain=[], P=P,
        )
        tokens_ingested += result["tokens_indexed"]

    return {
        "source_type": "document",
        "file_name": file_name,
        "tokens_ingested": tokens_ingested,
        "edges_created": 0,
    }
