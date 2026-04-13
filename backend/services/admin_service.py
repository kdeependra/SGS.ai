from core.meta_redis import RedisStore


def ping(store: RedisStore) -> dict:
    """Enhanced health check with write/read verification + latency."""
    result = store.ping()
    modules = _get_redis_modules(store)
    return {
        "status": result.get("status", "unknown"),
        "redis_connected": result.get("status") == "success",
        "write_read_ok": result.get("response", False),
        "latency": result.get("latency"),
        "modules": modules,
    }


def initialize_indices(store: RedisStore) -> dict:
    """Reinitialize all Redisearch indices."""
    store._initialize_indices()
    return {"status": "initialized"}


def list_indices(store: RedisStore) -> list[dict]:
    """List all Redisearch indices."""
    try:
        raw = store.redis.execute_command("FT._LIST")
        indices = []
        for name in raw:
            idx_name = name.decode() if isinstance(name, bytes) else str(name)
            info = get_index_info(store, idx_name)
            indices.append(info)
        return indices
    except Exception:
        return []


def get_index_info(store: RedisStore, name: str) -> dict:
    """Get info for a specific index."""
    try:
        raw = store.redis.ft(name).info()
        num_docs = 0
        fields = []
        if isinstance(raw, dict):
            num_docs = raw.get("num_docs", 0)
            fields = [f.get("identifier", "") for f in raw.get("attributes", [])]
        else:
            # Parse list format
            info_dict = {}
            for i in range(0, len(raw) - 1, 2):
                k = raw[i].decode() if isinstance(raw[i], bytes) else str(raw[i])
                info_dict[k] = raw[i + 1]
            num_docs = int(info_dict.get("num_docs", 0))
        return {"name": name, "num_docs": num_docs, "fields": fields}
    except Exception:
        return {"name": name, "num_docs": 0, "fields": []}


def cleanup_test_data(store: RedisStore, prefix: str) -> int:
    """Delete all keys matching a prefix. Returns count of deleted keys."""
    deleted = 0
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match=f"{prefix}*", count=100)
        if keys:
            deleted += store.redis.delete(*keys)
        if cursor == 0:
            break
    return deleted


def _get_redis_modules(store: RedisStore) -> list[str]:
    """Get list of loaded Redis modules."""
    try:
        modules = store.redis.module_list()
        return [m[b"name"].decode() if isinstance(m[b"name"], bytes) else str(m[b"name"]) for m in modules]
    except Exception:
        return []
