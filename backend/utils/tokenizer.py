import re

STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "for", "and", "or",
    "but", "in", "on", "at", "to", "from", "with", "by", "of", "that",
    "this", "it", "its", "me", "my", "i", "you", "your", "we", "our",
    "they", "their", "show", "find", "get", "all",
}


def tokenize_prompt(prompt: str) -> list[str]:
    """Tokenize a prompt: lowercase, extract words, remove stop words and short tokens."""
    all_tokens = re.findall(r"\b[a-zA-Z0-9]+\b", prompt.lower())
    return [t for t in all_tokens if t not in STOP_WORDS and len(t) > 1]


def tokenize_name(name: str) -> list[str]:
    """Tokenize a metadata name (column, table, db) into searchable words.

    Splits on underscores, camelCase boundaries, and non-alphanumeric characters.
    E.g., 'customer_addresses' → ['customer', 'addresses']
         'orderID' → ['order']  (ID too short)
    """
    all_tokens = re.findall(r"[a-zA-Z0-9]+", name.lower())
    return [t for t in all_tokens if t not in STOP_WORDS and len(t) > 1]
