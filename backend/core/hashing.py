import hashlib
import mmh3


def generate_content_hash(*parts: str) -> str:
    """Generate a SHA1 hash from concatenated string parts."""
    combined = "|".join(str(p) for p in parts)
    return hashlib.sha1(combined.encode("utf-8")).hexdigest()


def mmh3_hash64(token: str) -> int:
    """Return an unsigned 64-bit mmh3 hash for a token."""
    h, _ = mmh3.hash64(token)
    return h & 0xFFFFFFFFFFFFFFFF
