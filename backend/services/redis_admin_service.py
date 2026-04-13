"""Redis administration service exposing all redis_dev.ipynb functions.

Provides: DB flush, key stats/browser, index management, entity
registration, token operations, column analytics, and edge creation.
"""
import json
import re
import time
import uuid
from typing import Optional

from core.meta_redis import RedisStore
from core.hashing import generate_content_hash


# ───────────────────────── DB-level operations ─────────────────────────

def flush_db(store: RedisStore) -> dict:
    """Flush the entire Redis database. USE WITH CAUTION."""
    # Delete RedisGraph graphs before flush (module keys may persist)
    for graph_name in ("metadata", "graph"):
        try:
            store.redis.execute_command("GRAPH.DELETE", graph_name)
        except Exception:
            pass
    store.redis.flushdb()
    return {"status": "flushed"}


def get_key_stats(store: RedisStore) -> dict:
    """Count keys by well-known prefix groups."""
    prefixes = [
        "meta:db:", "meta:table:", "meta:column:", "meta:tokens:",
        "meta:file:", "meta:snapshot:", "meta:folder:", "meta:email:",
        "meta:mailbox:", "hll:col:", "edge:head:", "edge:tail:",
    ]
    counts = {}
    for p in prefixes:
        cursor, total = 0, 0
        while True:
            cursor, keys = store.redis.scan(cursor, match=f"{p}*", count=500)
            total += len(keys)
            if cursor == 0:
                break
        counts[p.rstrip(":")] = total

    info = store.redis.info("keyspace")
    db0 = info.get("db0", {})
    total_keys = db0.get("keys", 0) if isinstance(db0, dict) else 0
    return {"prefixes": counts, "total_keys": total_keys}


def browse_keys(store: RedisStore, pattern: str = "*", limit: int = 100) -> list[dict]:
    """List keys matching *pattern* with type and TTL."""
    results = []
    cursor = 0
    while len(results) < limit:
        cursor, keys = store.redis.scan(cursor, match=pattern, count=200)
        for k in keys:
            key_str = k.decode() if isinstance(k, bytes) else str(k)
            ktype = store.redis.type(k)
            ktype_str = ktype.decode() if isinstance(ktype, bytes) else str(ktype)
            ttl = store.redis.ttl(k)
            results.append({"key": key_str, "type": ktype_str, "ttl": ttl})
            if len(results) >= limit:
                break
        if cursor == 0:
            break
    return results


def get_key_value(store: RedisStore, key: str) -> dict:
    """Read the value of any Redis key (hash, string, set, list, etc.)."""
    ktype = store.redis.type(key)
    ktype_str = ktype.decode() if isinstance(ktype, bytes) else str(ktype)
    value = None

    if ktype_str == "hash":
        raw = store.redis.hgetall(key)
        value = {
            (k.decode() if isinstance(k, bytes) else str(k)):
            (v.decode("utf-8", errors="replace") if isinstance(v, bytes) else str(v))
            for k, v in raw.items()
        }
    elif ktype_str == "string":
        raw = store.redis.get(key)
        if raw:
            try:
                value = json.loads(raw.decode())
            except Exception:
                value = raw.decode("utf-8", errors="replace")
    elif ktype_str == "set":
        members = store.redis.smembers(key)
        value = [m.decode("utf-8", errors="replace") if isinstance(m, bytes) else str(m) for m in members]
    elif ktype_str == "list":
        value = [
            (v.decode("utf-8", errors="replace") if isinstance(v, bytes) else str(v))
            for v in store.redis.lrange(key, 0, -1)
        ]
    elif ktype_str == "zset":
        value = [
            {"member": m.decode("utf-8", errors="replace") if isinstance(m, bytes) else str(m), "score": s}
            for m, s in store.redis.zrange(key, 0, -1, withscores=True)
        ]
    else:
        value = f"(unsupported type: {ktype_str})"

    return {"key": key, "type": ktype_str, "value": value}


def delete_keys_by_pattern(store: RedisStore, pattern: str) -> int:
    """Delete all keys matching a pattern. Returns count of deleted."""
    deleted = 0
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match=pattern, count=200)
        if keys:
            deleted += store.redis.delete(*keys)
        if cursor == 0:
            break
    return deleted


# ───────────────────────── Index management ─────────────────────────

def _idx_fields():
    """Field definitions for each index, matching redis_dev.ipynb."""
    from redis.commands.search.field import TextField, NumericField, TagField
    return {
        "idx:db": {
            "prefix": "meta:db:",
            "fields": [
                TextField("db_name", sortable=True),
                TextField("db_type", sortable=True),
                TextField("host"),
                TextField("port", sortable=True),
                TextField("tables"),
            ],
        },
        "idx:table": {
            "prefix": "meta:table:",
            "fields": [
                TextField("table_name", sortable=True),
                TextField("db_sha1", sortable=True),
                TextField("schema_name", sortable=True),
                TextField("engine"),
                NumericField("row_count", sortable=True),
                NumericField("column_count", sortable=True),
                NumericField("data_length", sortable=True),
                TextField("created_at", sortable=True),
                TextField("updated_at", sortable=True),
                TextField("columns"),
            ],
        },
        "idx:column": {
            "prefix": "meta:column:",
            "fields": [
                TextField("column_name", sortable=True),
                TextField("table_sha1", sortable=True),
                TextField("db_sha1", sortable=True),
                TextField("data_type", sortable=True),
                TextField("key"),
                TextField("nullable", sortable=True),
                NumericField("cardinality", sortable=True),
            ],
        },
        "idx:tokens": {
            "prefix": "meta:tokens:",
            "fields": [
                TextField("token_hash", sortable=True),
                TextField("token_text"),
                NumericField("bin", sortable=True),
                NumericField("zeros", sortable=True),
                NumericField("TF", sortable=True),
                TagField("refs", separator=","),
                TagField("source_types", separator=","),
            ],
        },
    }


def create_index(store: RedisStore, index_name: str) -> dict:
    """Create (or recreate) a single RediSearch index by name."""
    from redis.commands.search.index_definition import IndexDefinition

    defs = _idx_fields()
    if index_name not in defs:
        return {"index": index_name, "status": "unknown_index"}

    spec = defs[index_name]
    try:
        store.redis.ft(index_name).dropindex(delete_documents=False)
    except Exception:
        pass

    store.redis.ft(index_name).create_index(
        spec["fields"],
        definition=IndexDefinition(prefix=[spec["prefix"]]),
    )
    return {"index": index_name, "status": "created"}


def initialize_all_indices(store: RedisStore) -> dict:
    """Create/recreate all four metadata indices (idx:db, idx:table, idx:column, idx:tokens)."""
    results = {}
    for name in _idx_fields():
        r = create_index(store, name)
        results[name] = r["status"]
    return {"indices": results}


def drop_index(store: RedisStore, index_name: str) -> dict:
    """Drop a RediSearch index without deleting documents."""
    try:
        store.redis.ft(index_name).dropindex(delete_documents=False)
        return {"index": index_name, "status": "dropped"}
    except Exception as e:
        return {"index": index_name, "status": f"error: {e}"}


# ───────────────────────── Entity registration (notebook Part 2) ────

def register_database(store: RedisStore, db_name: str, db_type: str,
                      host: str = "localhost", port: int = 5432) -> dict:
    """Register a database in Redis (matches redis_dev.ipynb register_database)."""
    ts = int(time.time() * 1000)
    db_sha1 = generate_content_hash(db_name, db_type, host, str(port))
    key = f"meta:db:{db_sha1}"
    store.redis.hset(key, mapping={
        "db_sha1": db_sha1, "db_name": db_name, "db_type": db_type,
        "host": host, "port": port, "created_at": ts, "updated_at": ts, "tables": "",
    })
    return {"sha1": db_sha1, "db_name": db_name}


def register_table(store: RedisStore, table_name: str, db_sha1: str,
                   schema_name: str = "public", row_count: int = 0) -> dict:
    """Register a table and link to parent DB."""
    ts = int(time.time() * 1000)
    table_sha1 = generate_content_hash(table_name, db_sha1, schema_name)
    key = f"meta:table:{table_sha1}"
    store.redis.hset(key, mapping={
        "table_sha1": table_sha1, "table_name": table_name,
        "db_sha1": db_sha1, "schema_name": schema_name,
        "row_count": row_count, "created_at": ts, "updated_at": ts, "columns": "",
    })
    # Update parent DB tables list
    db_key = f"meta:db:{db_sha1}"
    existing = store.redis.hget(db_key, "tables")
    tables_set = set((existing.decode().split(",")) if existing else [])
    tables_set.discard("")
    tables_set.add(table_sha1)
    store.redis.hset(db_key, "tables", ",".join(tables_set))
    store.redis.hset(db_key, "updated_at", ts)
    return {"sha1": table_sha1, "table_name": table_name}


# ───────────────────────── Token operations (notebook Part 1.5) ─────

STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "for", "and", "or",
    "but", "in", "on", "at", "to", "from", "with", "by", "of", "that",
    "this", "it", "its", "me", "my", "i", "you", "your", "we", "our",
    "they", "their", "show", "find", "get", "all",
}


def tokenize_prompt(prompt: str) -> dict:
    """Tokenize a prompt and return tokens + stats."""
    all_tokens = re.findall(r"\b[a-zA-Z0-9]+\b", prompt.lower())
    filtered = [t for t in all_tokens if t not in STOP_WORDS and len(t) > 1]
    return {"prompt": prompt, "all_tokens": all_tokens, "filtered_tokens": filtered}


def lookup_token_refs(store: RedisStore, tokens: list[str]) -> dict:
    """Look up token references from the generic token index."""
    import mmh3
    refs_by_type: dict[str, set] = {}
    token_details = []

    for token in tokens:
        token_hash, _ = mmh3.hash64(token)
        token_hash = token_hash & 0xFFFFFFFFFFFFFFFF
        token_key = f"meta:tokens:{token_hash:020}"
        data = store.redis.hgetall(token_key)
        if data:
            refs = (data.get(b"refs", b"").decode()).split(",")
            types = (data.get(b"source_types", b"").decode()).split(",")
            refs = [r for r in refs if r]
            types = [t for t in types if t]
            tf = int(data.get(b"TF", 0))
            token_details.append({"token": token, "refs": refs, "types": types, "TF": tf})
            for ref, stype in zip(refs, types):
                refs_by_type.setdefault(stype, set()).add(ref)
        else:
            token_details.append({"token": token, "refs": [], "types": [], "TF": 0})

    return {
        "tokens": token_details,
        "refs_by_type": {k: list(v) for k, v in refs_by_type.items()},
    }


def ingest_tokens(store: RedisStore, tokens: list[str], source_sha1: str,
                  source_type: str, parent_chain: Optional[list[dict]] = None,
                  P: int = 10) -> dict:
    """Ingest tokens from a leaf source with optional edge creation (from redis_dev.ipynb)."""
    import mmh3
    parent_chain = parent_chain or []
    ts = int(time.time() * 1000)
    pipe = store.redis.pipeline()

    for token in tokens:
        token_hash, _ = mmh3.hash64(token)
        token_hash = token_hash & 0xFFFFFFFFFFFFFFFF
        token_key = f"meta:tokens:{token_hash:020}"

        existing_refs = store.redis.hget(token_key, "refs")
        existing_types = store.redis.hget(token_key, "source_types")
        refs_list = existing_refs.decode().split(",") if existing_refs else []
        types_list = existing_types.decode().split(",") if existing_types else []
        refs_list = [r for r in refs_list if r]
        types_list = [t for t in types_list if t]

        if source_sha1 not in refs_list:
            refs_list.append(source_sha1)
            types_list.append(source_type)

        pipe.hincrby(token_key, "TF", 1)
        pipe.hset(token_key, "refs", ",".join(refs_list))
        pipe.hset(token_key, "source_types", ",".join(types_list))
        pipe.hsetnx(token_key, "token_hash", f"{token_hash:020}")
        pipe.hsetnx(token_key, "token_text", token[:100])
        pipe.hsetnx(token_key, "bin", token_hash >> (64 - P))
        zeros = (token_hash & -token_hash).bit_length() - 1 if token_hash != 0 else 0
        pipe.hsetnx(token_key, "zeros", zeros)

    pipe.execute()

    # Edge creation for parent chain
    edges_created = []
    if parent_chain:
        current_sha1 = source_sha1
        current_type = source_type
        for link in parent_chain:
            parent_sha1 = link["parent_sha1"]
            parent_type = link["parent_type"]
            edge_label = link["edge_label"]
            edge_sha1 = _create_edge_internal(store, current_sha1, parent_sha1, edge_label, {
                "child_type": current_type, "parent_type": parent_type, "created_at": ts,
            })
            edges_created.append({"edge_sha1": edge_sha1, "label": edge_label})
            current_sha1 = parent_sha1
            current_type = parent_type

    return {"tokens_indexed": len(tokens), "source_sha1": source_sha1, "edges_created": edges_created}


# ───────────────────────── Edge management ─────────────────────────

def create_entity_edge(store: RedisStore, left_sha1: str, right_sha1: str,
                       label: str, metadata: Optional[dict] = None) -> dict:
    """Create an edge between two entities (matches redis_dev.ipynb create_entity_edge)."""
    edge_sha1 = _create_edge_internal(store, left_sha1, right_sha1, label, metadata)
    return {"edge_sha1": edge_sha1, "label": label, "left": left_sha1, "right": right_sha1}


def _create_edge_internal(store: RedisStore, left: str, right: str,
                          label: str, metadata: Optional[dict] = None) -> str:
    """Internal edge creation helper."""
    commit_id = str(uuid.uuid1())
    ts = int(time.time() * 1000)
    attr = json.dumps(metadata or {})
    edge_data = {"label": label, "left": left, "right": right, "attr": attr}
    edge_sha1 = generate_content_hash(label, left, right)
    key = f"edge:head:{commit_id}:{edge_sha1}"
    edge_data["e_sha1"] = edge_sha1
    edge_data["timestamp"] = ts
    store.redis.hset(key, mapping=edge_data)
    return edge_sha1


def check_edge_exists(store: RedisStore, left_sha1: str, right_sha1: str, label: str) -> dict:
    """Check if an edge already exists between two entities (redis_dev.ipynb _edge_exists)."""
    # Scan edge:head:* keys matching left, right, label
    cursor = 0
    matches = []
    while True:
        cursor, keys = store.redis.scan(cursor, match="edge:head:*", count=200)
        for k in keys:
            data = store.redis.hgetall(k)
            if not data:
                continue
            d = {dk.decode(): dv.decode() for dk, dv in data.items()}
            if d.get("left") == left_sha1 and d.get("right") == right_sha1 and d.get("label") == label:
                matches.append({
                    "key": k.decode(),
                    "e_sha1": d.get("e_sha1", ""),
                    "label": d.get("label", ""),
                    "left": d.get("left", ""),
                    "right": d.get("right", ""),
                    "attr": d.get("attr", "{}"),
                    "timestamp": d.get("timestamp", ""),
                })
        if cursor == 0:
            break
    return {"exists": len(matches) > 0, "count": len(matches), "edges": matches}


# ───────────────────────── Query functions (notebook Part 4) ────────

def get_database_info(store: RedisStore, db_sha1: str) -> Optional[dict]:
    """Retrieve complete database info including tables and columns (redis_dev.ipynb get_database_info)."""
    raw = store.redis.hgetall(f"meta:db:{db_sha1}")
    if not raw:
        return None
    db_info = {k.decode(): v.decode() for k, v in raw.items()}

    tables = []
    raw_tables = db_info.get("tables", "")
    try:
        table_sha1s = json.loads(raw_tables) if raw_tables.startswith("[") else [t for t in raw_tables.split(",") if t]
    except Exception:
        table_sha1s = [t for t in raw_tables.split(",") if t]
    for table_sha1 in table_sha1s:
        t_raw = store.redis.hgetall(f"meta:table:{table_sha1}")
        if not t_raw:
            continue
        t_info = {k.decode(): v.decode() for k, v in t_raw.items()}
        # columns
        cols = []
        col_data = t_info.get("columns", "")
        # Could be comma-separated SHA1s or JSON array
        try:
            col_sha1s = json.loads(col_data) if col_data.startswith("[") else [c for c in col_data.split(",") if c]
        except Exception:
            col_sha1s = [c for c in col_data.split(",") if c]
        for col_sha1 in col_sha1s:
            c_raw = store.redis.hgetall(f"meta:column:{col_sha1}")
            if c_raw:
                cols.append({k.decode(): v.decode() for k, v in c_raw.items()})
        t_info["columns_info"] = cols
        tables.append(t_info)

    db_info["tables_info"] = tables
    return db_info


def search_columns_by_name(store: RedisStore, pattern: str) -> list[dict]:
    """Search columns by name pattern using RediSearch (redis_dev.ipynb search_columns_by_name)."""
    from redis.commands.search.query import Query
    try:
        q = Query(f"@column_name:{pattern}*").return_fields(
            "column_name", "table_sha1", "data_type", "cardinality",
        )
        results = store.redis.ft("idx:column").search(q)
        return [
            {
                "column_sha1": d.id.replace("meta:column:", "") if d.id.startswith("meta:column:") else d.id,
                "column_name": getattr(d, "column_name", None),
                "table_sha1": getattr(d, "table_sha1", None),
                "data_type": getattr(d, "data_type", None),
                "cardinality": getattr(d, "cardinality", None),
            }
            for d in results.docs
        ]
    except Exception:
        return []


def get_column_statistics(store: RedisStore, column_sha1: str) -> Optional[dict]:
    """Get column stats including selectivity (redis_dev.ipynb get_column_statistics)."""
    raw = store.redis.hgetall(f"meta:column:{column_sha1}")
    if not raw:
        return None
    info = {k.decode(): v.decode() for k, v in raw.items()}
    table_sha1 = info.get("table_sha1")
    if table_sha1:
        t_raw = store.redis.hgetall(f"meta:table:{table_sha1}")
        if t_raw:
            info["table_name"] = t_raw.get(b"table_name", b"").decode()
            row_count = int(t_raw.get(b"row_count", 0))
            info["table_row_count"] = row_count
            cardinality = int(info.get("cardinality", 0))
            info["selectivity"] = cardinality / row_count if row_count > 0 else 0
    return info


def find_similar_columns(store: RedisStore, column_sha1: str) -> list[dict]:
    """Find columns with similar distributions (redis_dev.ipynb find_similar_columns)."""
    from redis.commands.search.query import Query
    source = store.redis.hgetall(f"meta:column:{column_sha1}")
    if not source:
        return []
    try:
        results = store.redis.ft("idx:column").search(
            Query("*").return_fields("column_name", "data_type", "cardinality"),
        )
        return [
            {
                "column_sha1": d.id.replace("meta:column:", "") if d.id.startswith("meta:column:") else d.id,
                "column_name": getattr(d, "column_name", None),
                "data_type": getattr(d, "data_type", None),
                "cardinality": getattr(d, "cardinality", None),
            }
            for d in results.docs
            if (d.id.replace("meta:column:", "") if d.id.startswith("meta:column:") else d.id) != column_sha1
        ]
    except Exception:
        return []


# ───────────────────────── Cleanup (notebook Part 5) ────────────────

CLEANUP_CATEGORIES = {
    "databases": "meta:db:*",
    "tables": "meta:table:*",
    "columns": "meta:column:*",
    "tokens": "meta:tokens:*",
    "snapshots": "meta:snapshot:*",
    "files": "meta:file:*",
    "edges_head": "edge:head:*",
    "edges_tail": "edge:tail:*",
    "hll": "hll:col:*",
}


def cleanup_by_category(store: RedisStore, categories: list[str]) -> dict:
    """Delete keys for selected categories (databases, tables, columns, etc.)."""
    results = {}
    for cat in categories:
        pattern = CLEANUP_CATEGORIES.get(cat)
        if pattern:
            count = delete_keys_by_pattern(store, pattern)
            results[cat] = count
    return {"deleted": results, "total": sum(results.values())}


def list_all_indices(store: RedisStore) -> list[dict]:
    """List all RediSearch indices with doc counts (redis_dev.ipynb list_all_indices)."""
    try:
        raw = store.redis.execute_command("FT._LIST")
        indices = []
        for name in raw:
            idx_name = name.decode() if isinstance(name, bytes) else str(name)
            try:
                info = store.redis.ft(idx_name).info()
                num_docs = 0
                if isinstance(info, dict):
                    num_docs = info.get("num_docs", 0)
                else:
                    for i in range(0, len(info) - 1, 2):
                        k = info[i].decode() if isinstance(info[i], bytes) else str(info[i])
                        if k == "num_docs":
                            num_docs = int(info[i + 1])
                            break
                indices.append({"name": idx_name, "num_docs": num_docs})
            except Exception:
                indices.append({"name": idx_name, "num_docs": 0})
        return indices
    except Exception:
        return []
