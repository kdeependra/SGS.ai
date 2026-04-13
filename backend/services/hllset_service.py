from core.meta_redis import RedisStore


def store_hllset(store: RedisStore, key: str, values: list[str]) -> dict:
    """Create an HLLSet from values and store as Roaring Bitmap."""
    try:
        from meta_algebra import HllSet
    except Exception:
        raise RuntimeError("HLLSet operations require Julia runtime (meta_algebra). Julia is not available.")
    hll = HllSet()
    for v in values:
        hll.add(v)
    pipe = store.redis.pipeline()
    store.store_hllset(pipe, key, hll)
    pipe.execute()
    return {"key": key, "cardinality": int(hll.count())}


def retrieve_hllset(store: RedisStore, key: str) -> dict:
    """Retrieve an HLLSet and return its cardinality."""
    hll = store.retrieve_hllset(key)
    if hll is None:
        return {"key": key, "cardinality": 0, "exists": False}
    return {"key": key, "cardinality": int(hll.count()), "exists": True}


def set_operation(store: RedisStore, operation: str, keys: list[str], result_key: str) -> dict:
    """Perform union/intersection/difference on two stored HLLSets."""
    hll_a = store.retrieve_hllset(keys[0])
    hll_b = store.retrieve_hllset(keys[1])
    if hll_a is None or hll_b is None:
        raise ValueError("One or both source keys do not exist")

    if operation == "union":
        result_hll = hll_a.union(hll_b)
    elif operation == "intersection":
        result_hll = hll_a.intersection(hll_b)
    elif operation == "difference":
        deleted, retained, new = hll_a.difference(hll_b)
        result_hll = new  # Return the 'new' component
    else:
        raise ValueError(f"Unknown operation: {operation}")

    pipe = store.redis.pipeline()
    store.store_hllset(pipe, result_key, result_hll)
    pipe.execute()
    return {"result_key": result_key, "cardinality": int(result_hll.count())}
