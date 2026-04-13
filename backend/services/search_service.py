from core.meta_redis import RedisStore
from core.hashing import mmh3_hash64, generate_content_hash
from utils.tokenizer import tokenize_prompt
import json


def hierarchical_match(store: RedisStore, prompt: str, thresholds: dict[str, float] | None = None) -> dict:
    """Full prompt-to-discovery pipeline: tokenize, lookup, resolve, match, generate SQL.

    Searches across all metadata levels: databases, tables, columns, and files.
    """
    HllSet = None

    tokens = tokenize_prompt(prompt)
    if not tokens:
        return {"tokens": [], "matches": [], "sql_candidates": [], "other_sources": {}}

    # Token lookup → refs by type
    all_refs: dict[str, set] = {"column": set(), "table": set(), "database": set(), "file": set()}
    for token in tokens:
        refs = _lookup_single_token(store, token)
        for kind, sha_list in refs.items():
            all_refs.setdefault(kind, set()).update(sha_list)

    matches = []
    sql_candidates = []
    seen_tables: set[str] = set()

    # --- 1. Table-level matches (highest priority) ---
    for table_sha1 in all_refs.get("table", []):
        table_data = store.redis.hgetall(f"meta:table:{table_sha1}")
        if not table_data:
            continue
        table_info = {k.decode(): v.decode() for k, v in table_data.items()}
        table_name = table_info.get("table_name", "")
        db_sha1 = table_info.get("db_sha1", "")

        db_data = store.redis.hgetall(f"meta:db:{db_sha1}") if db_sha1 else {}
        db_name = db_data.get(b"db_name", b"").decode() if db_data else ""

        # Load all columns for this table
        try:
            col_sha1_list = json.loads(table_info.get("columns", "[]"))
        except Exception:
            col_sha1_list = []

        col_children = []
        col_names = []
        for col_sha1 in col_sha1_list:
            col_data = store.redis.hgetall(f"meta:column:{col_sha1}")
            if col_data:
                cn = col_data.get(b"column_name", b"").decode()
                col_names.append(cn)
                col_children.append({
                    "sha1": col_sha1,
                    "level": "column",
                    "name": cn,
                    "score": 0.9,
                    "parent_sha1": table_sha1,
                    "children": [],
                })

        table_node = {
            "sha1": table_sha1,
            "level": "table",
            "name": table_name,
            "score": 1.0,
            "parent_sha1": db_sha1,
            "children": col_children,
        }

        match_entry = {
            "sha1": db_sha1 or table_sha1,
            "level": "db",
            "name": db_name or table_name,
            "score": 1.0,
            "parent_sha1": None,
            "children": [table_node] if db_sha1 else col_children,
        }
        matches.append(match_entry)
        seen_tables.add(table_sha1)

        # SQL: SELECT * FROM table
        sql_candidates.append({
            "sql": f"SELECT * FROM {table_name}",
            "db": db_name,
            "table": table_name,
            "columns": col_names[:10],
            "confidence": 1.0,
        })

    # --- 2. Column-level matches ---
    for col_sha1 in all_refs.get("column", []):
        col_data = store.redis.hgetall(f"meta:column:{col_sha1}")
        if not col_data:
            continue
        col_info = {k.decode(): v.decode() for k, v in col_data.items()}
        table_sha1 = col_info.get("table_sha1", "")
        db_sha1 = col_info.get("db_sha1", "")

        # Skip if this column's table was already matched at table level
        if table_sha1 in seen_tables:
            continue

        table_data = store.redis.hgetall(f"meta:table:{table_sha1}")
        table_name = table_data.get(b"table_name", b"").decode() if table_data else ""
        db_data = store.redis.hgetall(f"meta:db:{db_sha1}") if db_sha1 else {}
        db_name = db_data.get(b"db_name", b"").decode() if db_data else ""

        col_name = col_info.get("column_name", "")
        match_entry = {
            "sha1": db_sha1 or col_sha1,
            "level": "db",
            "name": db_name or "unknown",
            "score": 0.6,
            "parent_sha1": None,
            "children": [{
                "sha1": table_sha1,
                "level": "table",
                "name": table_name,
                "score": 0.8,
                "parent_sha1": db_sha1,
                "children": [{
                    "sha1": col_sha1,
                    "level": "column",
                    "name": col_name,
                    "score": 1.0,
                    "parent_sha1": table_sha1,
                    "children": [],
                }],
            }],
        }
        matches.append(match_entry)

        sql_candidates.append({
            "sql": f"SELECT {col_name} FROM {table_name}",
            "db": db_name,
            "table": table_name,
            "columns": [col_name],
            "confidence": 0.8,
        })

    # --- 3. Database-level matches ---
    for db_sha1 in all_refs.get("database", []):
        db_data = store.redis.hgetall(f"meta:db:{db_sha1}")
        if not db_data:
            continue
        db_info = {k.decode(): v.decode() for k, v in db_data.items()}
        db_name = db_info.get("db_name", "")

        try:
            table_sha1_list = json.loads(db_info.get("tables", "[]"))
        except Exception:
            table_sha1_list = []

        table_children = []
        for t_sha1 in table_sha1_list[:20]:
            if t_sha1 in seen_tables:
                continue
            t_data = store.redis.hgetall(f"meta:table:{t_sha1}")
            if t_data:
                t_name = t_data.get(b"table_name", b"").decode()
                table_children.append({
                    "sha1": t_sha1,
                    "level": "table",
                    "name": t_name,
                    "score": 0.7,
                    "parent_sha1": db_sha1,
                    "children": [],
                })

        if table_children:
            matches.append({
                "sha1": db_sha1,
                "level": "db",
                "name": db_name,
                "score": 0.9,
                "parent_sha1": None,
                "children": table_children,
            })

    # --- 4. File-level matches ---
    file_sources = []
    for file_sha1 in all_refs.get("file", []):
        file_data = store.redis.hgetall(f"meta:file:{file_sha1}")
        if file_data:
            fi = {k.decode(): v.decode() for k, v in file_data.items()}
            file_name = fi.get("file_name", file_sha1)
            file_sources.append(file_name)

            matches.append({
                "sha1": file_sha1,
                "level": "db",
                "name": f"[File] {file_name}",
                "score": 0.8,
                "parent_sha1": None,
                "children": [],
            })

    # Sort: table matches first (score=1.0), then columns, then files
    matches.sort(key=lambda m: m["score"], reverse=True)
    sql_candidates.sort(key=lambda s: s["confidence"], reverse=True)

    other_sources = {
        "file": file_sources,
    }

    return {
        "tokens": tokens,
        "matches": matches,
        "sql_candidates": sql_candidates,
        "other_sources": other_sources,
    }


def lookup_token_refs(store: RedisStore, tokens: list[str]) -> dict[str, dict[str, list[str]]]:
    """Token → leaf refs by type."""
    results = {}
    for token in tokens:
        results[token] = _lookup_single_token(store, token)
    return results


def resolve_compound_sources(store: RedisStore, leaf_refs: list[str]) -> list[dict]:
    """Resolve leaf refs to compound sources via edge traversal."""
    compounds = []
    for ref_sha1 in leaf_refs:
        # Check if it's a column, resolve up to table → db
        col_data = store.redis.hgetall(f"meta:column:{ref_sha1}")
        if col_data:
            info = {k.decode(): v.decode() for k, v in col_data.items()}
            compounds.append({
                "leaf_sha1": ref_sha1,
                "type": "column",
                "column_name": info.get("column_name", ""),
                "table_sha1": info.get("table_sha1", ""),
                "db_sha1": info.get("db_sha1", ""),
            })
    return compounds


def raw_search(store: RedisStore, index_name: str, query: str) -> dict:
    """Execute a raw Redisearch query."""
    try:
        result = store.redis.ft(index_name).search(query)
        docs = []
        for doc in result.docs:
            doc_dict = {"id": doc.id}
            for attr in dir(doc):
                if not attr.startswith("_") and attr not in ("id", "payload"):
                    val = getattr(doc, attr, None)
                    if val is not None and not callable(val):
                        doc_dict[attr] = str(val)
            docs.append(doc_dict)
        return {"total": result.total, "docs": docs}
    except Exception as e:
        return {"total": 0, "docs": [], "error": str(e)}


def _lookup_single_token(store: RedisStore, token: str) -> dict[str, list[str]]:
    """Lookup a single token's leaf references, classified by source_type."""
    token_hash = mmh3_hash64(token)
    token_key = f"meta:tokens:{token_hash:020}"
    data = store.redis.hgetall(token_key)
    if not data:
        return {"column": [], "table": [], "database": [], "file": []}

    raw_refs = data.get(b"refs", b"").decode()
    raw_types = data.get(b"source_types", b"").decode()

    ref_list = [r.strip() for r in raw_refs.split(",") if r.strip()]
    type_list = [t.strip() for t in raw_types.split(",") if t.strip()]

    result: dict[str, list[str]] = {"column": [], "table": [], "database": [], "file": []}
    for i, ref in enumerate(ref_list):
        # Use source_types if available, otherwise probe Redis keys
        if i < len(type_list):
            stype = type_list[i]
        else:
            if store.redis.exists(f"meta:table:{ref}"):
                stype = "table"
            elif store.redis.exists(f"meta:db:{ref}"):
                stype = "database"
            elif store.redis.exists(f"meta:file:{ref}"):
                stype = "file"
            else:
                stype = "column"

        bucket = stype if stype in result else "column"
        if ref not in result[bucket]:
            result[bucket].append(ref)

    return result


def _jaccard_estimate(hll_a, hll_b) -> float:
    """Estimate Jaccard similarity between two HLLSets."""
    try:
        union_hll = hll_a.union(hll_b)
        intersection_hll = hll_a.intersection(hll_b)
        union_count = union_hll.count()
        if union_count == 0:
            return 0.0
        return intersection_hll.count() / union_count
    except Exception:
        return 0.0
