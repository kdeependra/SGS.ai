from core.meta_redis import RedisStore


def ingest(store: RedisStore, location_tokens: list[str], dataset_tokens: list[str]) -> dict:
    """Dual-token ingest: creates HLLSets in buffer namespace."""
    loc_key, dataset_key = store.ingest(location_tokens, dataset_tokens)
    return {"location_key": loc_key, "dataset_key": dataset_key}


def commit(store: RedisStore, location_key: str, dataset_key: str,
           label: str = "id", metadata: dict | None = None) -> dict:
    """Promote buffer keys to persistent storage."""
    return store.commit(location_key, dataset_key, label, metadata)


def list_commits(store: RedisStore) -> list[dict]:
    """List all commits from the commits index."""
    commits = []
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:commits:*", count=100)
        for k in keys:
            data = store.redis.hgetall(k)
            if data:
                info = {dk.decode(): dv.decode() for dk, dv in data.items()}
                commit_id = k.decode().split(":")[-1]
                commits.append({
                    "commit_id": commit_id,
                    "timestamp": int(info.get("timestamp", 0)),
                    "edge_key": info.get("edge_key", ""),
                })
        if cursor == 0:
            break
    commits.sort(key=lambda c: c["timestamp"], reverse=True)
    return commits


def get_commit(store: RedisStore, commit_id: str) -> dict | None:
    """Get details for a specific commit."""
    data = store.redis.hgetall(f"meta:commits:{commit_id}")
    if not data:
        return None
    info = {k.decode(): v.decode() for k, v in data.items()}
    return {
        "commit_id": commit_id,
        "timestamp": int(info.get("timestamp", 0)),
        "edge_key": info.get("edge_key", ""),
    }
