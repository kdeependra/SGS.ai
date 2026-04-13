import os
from pydantic_settings import BaseSettings
from functools import lru_cache

_ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")


class Settings(BaseSettings):
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    hllsets_path: str = ""
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    mcp_server_url: str = "http://localhost:8001"
    anthropic_api_key: str = ""
    app_title: str = "MetaData Management System"
    app_version: str = "0.1.0"

    class Config:
        env_file = _ENV_FILE
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
