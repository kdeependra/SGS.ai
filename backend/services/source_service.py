import json
from core.meta_redis import RedisStore
from core.hashing import generate_content_hash


def register_database(store: RedisStore, db_name: str, db_type: str, host: str, port: int) -> dict:
    sha1 = generate_content_hash(db_name, db_type, host, str(port))
    key = f"meta:db:{sha1}"
    store.redis.hset(key, mapping={
        "db_name": db_name,
        "db_type": db_type,
        "host": host,
        "port": str(port),
        "tables": "[]",
    })
    return {"sha1": sha1, "db_name": db_name, "db_type": db_type, "host": host, "port": port}


def get_database_info(store: RedisStore, sha1: str) -> dict | None:
    key = f"meta:db:{sha1}"
    data = store.redis.hgetall(key)
    if not data:
        return None
    info = {k.decode(): v.decode() for k, v in data.items()}
    tables_json = info.pop("tables", "[]")
    tables_list = json.loads(tables_json)

    tables = []
    for t_sha1 in tables_list:
        t_info = get_table_info(store, t_sha1)
        if t_info:
            tables.append(t_info)

    return {"sha1": sha1, "db_name": info["db_name"], "db_type": info["db_type"], "tables": tables}


def register_table(store: RedisStore, table_name: str, db_sha1: str, schema_name: str, row_count: int) -> dict:
    sha1 = generate_content_hash(table_name, db_sha1, schema_name)
    key = f"meta:table:{sha1}"
    store.redis.hset(key, mapping={
        "table_name": table_name,
        "db_sha1": db_sha1,
        "schema_name": schema_name,
        "row_count": str(row_count),
        "columns": "[]",
    })
    # Update parent DB's table list
    db_key = f"meta:db:{db_sha1}"
    raw = store.redis.hget(db_key, "tables")
    tables = json.loads(raw.decode()) if raw else []
    if sha1 not in tables:
        tables.append(sha1)
        store.redis.hset(db_key, "tables", json.dumps(tables))
    return {"sha1": sha1, "table_name": table_name, "db_sha1": db_sha1, "schema_name": schema_name, "row_count": row_count}


def get_table_info(store: RedisStore, sha1: str) -> dict | None:
    key = f"meta:table:{sha1}"
    data = store.redis.hgetall(key)
    if not data:
        return None
    info = {k.decode(): v.decode() for k, v in data.items()}
    cols_json = info.pop("columns", "[]")
    cols_list = json.loads(cols_json)

    columns = []
    for c_sha1 in cols_list:
        c_info = get_column_meta(store, c_sha1)
        if c_info:
            columns.append(c_info)

    return {
        "sha1": sha1,
        "table_name": info["table_name"],
        "schema_name": info.get("schema_name", "public"),
        "row_count": int(info.get("row_count", 0)),
        "columns": columns,
    }


def load_column_with_hllset(store: RedisStore, column_name: str, table_sha1: str, db_sha1: str,
                             values: list[str], data_type: str, nullable: bool) -> dict:
    try:
        from meta_algebra import HllSet
    except Exception:
        HllSet = None

    sha1 = generate_content_hash(column_name, table_sha1, db_sha1)
    cardinality = len(set(values))
    if HllSet:
        hll = HllSet()
        for v in values:
            hll.add(v)
        cardinality = int(hll.count())

    # Store HLL blob (if Julia available)
    if HllSet:
        pipe = store.redis.pipeline()
        store.store_hllset(pipe, f"hll:col:{sha1}", hll)
        pipe.execute()

    # Store metadata
    store.redis.hset(f"meta:column:{sha1}", mapping={
        "column_name": column_name,
        "table_sha1": table_sha1,
        "db_sha1": db_sha1,
        "data_type": data_type,
        "nullable": str(nullable),
        "cardinality": str(cardinality),
    })

    # Update parent table
    tbl_key = f"meta:table:{table_sha1}"
    raw = store.redis.hget(tbl_key, "columns")
    cols = json.loads(raw.decode()) if raw else []
    if sha1 not in cols:
        cols.append(sha1)
        store.redis.hset(tbl_key, "columns", json.dumps(cols))

    # Index column tokens
    tokens = [column_name] + values[:200]  # index column name + sample values
    store._update_token_index_bulk(tokens, sha1, 10)

    return {"sha1": sha1, "column_name": column_name, "table_sha1": table_sha1, "db_sha1": db_sha1, "cardinality": cardinality}


def get_column_meta(store: RedisStore, sha1: str) -> dict | None:
    data = store.redis.hgetall(f"meta:column:{sha1}")
    if not data:
        return None
    info = {k.decode(): v.decode() for k, v in data.items()}
    return {
        "sha1": sha1,
        "column_name": info["column_name"],
        "data_type": info.get("data_type", "varchar"),
        "cardinality": int(info.get("cardinality", 0)),
        "nullable": info.get("nullable", "True") == "True",
    }


def get_column_statistics(store: RedisStore, sha1: str) -> dict | None:
    meta = get_column_meta(store, sha1)
    if not meta:
        return None
    # Check if HLL exists
    hll_key = f"hll:col:{sha1}"
    hll_exists = store.redis.exists(hll_key)
    return {
        "sha1": sha1,
        "column_name": meta["column_name"],
        "cardinality": meta["cardinality"],
        "selectivity": 1.0 / max(meta["cardinality"], 1),
        "data_type": meta["data_type"],
        "nullable": meta["nullable"],
        "hll_size": int(store.redis.strlen(hll_key)) if hll_exists else 0,
    }


def search_columns_by_name(store: RedisStore, pattern: str) -> list[dict]:
    results = []
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:column:*", count=100)
        for k in keys:
            data = store.redis.hgetall(k)
            if data:
                info = {dk.decode(): dv.decode() for dk, dv in data.items()}
                if pattern.lower() in info.get("column_name", "").lower():
                    col_sha1 = k.decode().split(":")[-1]
                    results.append({
                        "sha1": col_sha1,
                        "column_name": info["column_name"],
                        "data_type": info.get("data_type", "varchar"),
                        "cardinality": int(info.get("cardinality", 0)),
                        "nullable": info.get("nullable", "True") == "True",
                    })
        if cursor == 0:
            break
    return results
