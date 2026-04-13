import json
from core.meta_redis import RedisStore
from core.hashing import generate_content_hash


def create_edge(store: RedisStore, left: str, right: str, label: str, attr: dict | None = None) -> dict:
    """Create an entity edge."""
    import time
    import uuid

    edge_sha1 = generate_content_hash(left, right, label)
    commit_id = str(uuid.uuid1())
    timestamp = int(time.time() * 1000)
    edge_key = f"edge:head:{commit_id}:{edge_sha1}"
    edge_data = {
        "e_sha1": edge_sha1,
        "label": label,
        "left": left,
        "right": right,
        "attr": json.dumps(attr or {}),
        "timestamp": str(timestamp),
        "state": "head",
    }
    store.redis.hset(edge_key, mapping=edge_data)
    return {
        "key": edge_key,
        "e_sha1": edge_sha1,
        "label": label,
        "left": left,
        "right": right,
        "attr": json.dumps(attr or {}),
        "timestamp": timestamp,
        "state": "head",
    }


def archive_edges(store: RedisStore, entity_sha1: str) -> int:
    """Archive all head edges for a given entity (move to tail)."""
    pipe = store.redis.pipeline()
    store._archive_existing_edges(pipe, entity_sha1)
    results = pipe.execute()
    return len(results)


def search_edges(store: RedisStore, state: str = "head") -> list[dict]:
    """Search edges by state."""
    index_name = f"edge:{state}" if state in ("head", "tail") else "edge"
    try:
        result = store.redis.ft(index_name).search("*")
        edges = []
        for doc in result.docs:
            edges.append({
                "key": doc.id,
                "e_sha1": getattr(doc, "e_sha1", ""),
                "label": getattr(doc, "label", ""),
                "left": getattr(doc, "left", ""),
                "right": getattr(doc, "right", ""),
                "attr": getattr(doc, "attr", ""),
                "timestamp": int(getattr(doc, "timestamp", 0)),
                "state": state,
            })
        return edges
    except Exception:
        return []


def find_similar_columns(store: RedisStore, column_sha1: str) -> list[dict]:
    """Find columns with similar HLLSet Jaccard similarity."""
    target_hll = store.retrieve_hllset(f"hll:col:{column_sha1}")
    if target_hll is None:
        return []

    results = []
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="hll:col:*", count=100)
        for k in keys:
            other_sha1 = k.decode().split(":")[-1]
            if other_sha1 == column_sha1:
                continue
            other_hll = store.retrieve_hllset(k.decode())
            if other_hll is None:
                continue
            try:
                union_hll = target_hll.union(other_hll)
                intersection_hll = target_hll.intersection(other_hll)
                union_count = union_hll.count()
                jaccard = intersection_hll.count() / union_count if union_count > 0 else 0.0
                if jaccard > 0.1:
                    col_data = store.redis.hgetall(f"meta:column:{other_sha1}")
                    col_name = col_data.get(b"column_name", b"").decode() if col_data else other_sha1
                    results.append({
                        "sha1": other_sha1,
                        "column_name": col_name,
                        "jaccard": round(jaccard, 4),
                    })
            except Exception:
                continue
        if cursor == 0:
            break

    results.sort(key=lambda r: r["jaccard"], reverse=True)
    return results
