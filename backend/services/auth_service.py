"""Authentication service – MySQL-backed user/role management with JWT tokens."""
import datetime
import os
from pathlib import Path
import mysql.connector
from mysql.connector import pooling
from passlib.hash import pbkdf2_sha256
import jwt

SECRET_KEY = "sgs-ai-secret-key-change-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 480  # 8 hours

_pool: pooling.MySQLConnectionPool | None = None

# Detect Docker environment
_IN_DOCKER = Path("/.dockerenv").exists() or os.getenv("RUNNING_IN_DOCKER") == "1"
_MYSQL_HOST = os.getenv("AUTH_DB_HOST", "host.docker.internal" if _IN_DOCKER else "localhost")
_MYSQL_PORT = int(os.getenv("AUTH_DB_PORT", "3306"))
_MYSQL_USER = os.getenv("AUTH_DB_USER", "root")
_MYSQL_PASS = os.getenv("AUTH_DB_PASSWORD", "admin")
_MYSQL_DB   = os.getenv("AUTH_DB_NAME", "metadatamgmt")


def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="auth_pool",
            pool_size=5,
            host=_MYSQL_HOST,
            port=_MYSQL_PORT,
            user=_MYSQL_USER,
            password=_MYSQL_PASS,
            database=_MYSQL_DB,
        )
    return _pool


def _get_conn():
    return _get_pool().get_connection()


def authenticate_user(username: str, password: str) -> dict | None:
    conn = _get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """SELECT u.id, u.username, u.email, u.password_hash, u.is_active,
                      r.name as role
               FROM users u JOIN roles r ON u.role_id = r.id
               WHERE u.username = %s""",
            (username,),
        )
        user = cur.fetchone()
        cur.close()
        if not user:
            return None
        if not user["is_active"]:
            return None
        if not pbkdf2_sha256.verify(password, user["password_hash"]):
            return None
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
        }
    finally:
        conn.close()


def create_token(user: dict) -> str:
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "exp": datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(minutes=TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_by_id(user_id: int) -> dict | None:
    conn = _get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """SELECT u.id, u.username, u.email, u.is_active, r.name as role
               FROM users u JOIN roles r ON u.role_id = r.id
               WHERE u.id = %s""",
            (user_id,),
        )
        user = cur.fetchone()
        cur.close()
        return user
    finally:
        conn.close()


def list_users() -> list[dict]:
    conn = _get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """SELECT u.id, u.username, u.email, u.is_active,
                      r.name as role, u.created_at
               FROM users u JOIN roles r ON u.role_id = r.id
               ORDER BY u.id"""
        )
        rows = cur.fetchall()
        cur.close()
        for r in rows:
            if r.get("created_at"):
                r["created_at"] = str(r["created_at"])
        return rows
    finally:
        conn.close()
