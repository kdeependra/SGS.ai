from functools import lru_cache
from config import Settings, get_settings
from core.meta_redis import RedisStore


_redis_store: RedisStore | None = None


def get_redis_store() -> RedisStore:
    global _redis_store
    if _redis_store is None:
        settings = get_settings()
        _redis_store = RedisStore(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
        )
    return _redis_store
