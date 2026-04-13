from core.meta_redis import RedisStore
from core.hashing import mmh3_hash64


def ingest_tokens(store: RedisStore, tokens: list[str], ref_sha1: str, P: int = 10):
    """Index tokens from any leaf source with automatic edge creation."""
    store._update_token_index_bulk(tokens, ref_sha1, P)


def lookup_token_info(store: RedisStore, token: str) -> dict | None:
    """Get full metadata for a single token."""
    token_hash = mmh3_hash64(token)
    token_key = f"meta:tokens:{token_hash:020}"
    data = store.redis.hgetall(token_key)
    if not data:
        return None
    return {k.decode(): v.decode() for k, v in data.items()}
