import json
from core.meta_redis import RedisStore


def execute_graph_query(store: RedisStore, query: str) -> list:
    """Execute a Redis Graph query."""
    result = store.execute_graph_query(query)
    # Convert to serializable format
    if isinstance(result, (list, tuple)):
        return [str(r) for r in result]
    return [str(result)]


def roaring_bitmap_command(store: RedisStore, command: str, args: list[str]):
    """Execute a Roaring Bitmap command."""
    result = store.roaring_bitmap_command(command, *args)
    if isinstance(result, bytes):
        return result.decode(errors="replace")
    return result


def get_metadata_graph(store: RedisStore) -> dict:
    """Build a full metadata graph from Redis keys: databases, tables, columns, edges."""
    nodes: list[dict] = []
    edges: list[dict] = []
    node_ids: set[str] = set()
    pending_file_table_edges: list[tuple] = []  # (file_sha1, table_node_id)

    # Scan databases
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:db:*", count=100)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            node_id = f"db:{sha1}"
            nodes.append({
                "id": node_id,
                "type": "database",
                "label": info.get("db_name", sha1),
                "sha1": sha1,
                "db_type": info.get("db_type", ""),
            })
            node_ids.add(node_id)
            # Parse tables list
            tables_raw = info.get("tables", "[]")
            try:
                table_list = json.loads(tables_raw)
            except Exception:
                table_list = []
            for t_sha1 in table_list:
                edges.append({"source": node_id, "target": f"table:{t_sha1}", "label": "has_table"})
        if cursor == 0:
            break

    # Scan tables
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:table:*", count=100)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            node_id = f"table:{sha1}"
            nodes.append({
                "id": node_id,
                "type": "table",
                "label": info.get("table_name", sha1),
                "sha1": sha1,
                "row_count": int(info.get("row_count", 0)),
            })
            node_ids.add(node_id)
            columns_raw = info.get("columns", "[]")
            try:
                col_list = json.loads(columns_raw)
            except Exception:
                col_list = []
            for c_sha1 in col_list:
                edges.append({"source": node_id, "target": f"col:{c_sha1}", "label": "has_column"})
            # Link to parent database or file
            db_sha1 = info.get("db_sha1", "")
            if db_sha1:
                if f"db:{db_sha1}" in node_ids:
                    edges.append({"source": f"db:{db_sha1}", "target": node_id, "label": "has_table"})
                else:
                    # db_sha1 may point to a file (CSV/document sources)
                    pending_file_table_edges.append((db_sha1, node_id))
        if cursor == 0:
            break

    # Scan columns
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:column:*", count=100)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            node_id = f"col:{sha1}"
            nodes.append({
                "id": node_id,
                "type": "column",
                "label": info.get("column_name", sha1),
                "sha1": sha1,
                "data_type": info.get("data_type", ""),
                "cardinality": int(info.get("cardinality", 0)),
            })
            node_ids.add(node_id)
        if cursor == 0:
            break

    # Scan files (CSV / documents)
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:file:*", count=100)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            source_type = info.get("source_type", "file")
            node_id = f"file:{sha1}"
            node = {
                "id": node_id,
                "type": "file",
                "label": info.get("file_name", sha1),
                "sha1": sha1,
                "source_type": source_type,
                "file_size": int(info.get("file_size", 0)),
            }
            if source_type == "csv":
                node["row_count"] = int(info.get("row_count", 0))
                node["column_count"] = int(info.get("column_count", 0))
            elif source_type == "document":
                node["doc_type"] = info.get("doc_type", "")
                node["word_count"] = int(info.get("word_count", 0))
            nodes.append(node)
            node_ids.add(node_id)
            # Link to folder if present
            folder_sha1 = info.get("folder_sha1")
            if folder_sha1:
                edges.append({"source": f"folder:{folder_sha1}", "target": node_id, "label": "contains_file"})
        if cursor == 0:
            break

    # Resolve pending file→table edges (CSV/document tables whose db_sha1 points to a file)
    for file_sha1, table_node_id in pending_file_table_edges:
        file_node_id = f"file:{file_sha1}"
        if file_node_id in node_ids:
            edges.append({"source": file_node_id, "target": table_node_id, "label": "has_table"})

    # Scan folders
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:folder:*", count=100)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            node_id = f"folder:{sha1}"
            nodes.append({
                "id": node_id,
                "type": "folder",
                "label": info.get("folder_name", sha1),
                "sha1": sha1,
                "source_type": "folder",
            })
            node_ids.add(node_id)
        if cursor == 0:
            break

    # Scan mailboxes
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:mailbox:*", count=100)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            node_id = f"mailbox:{sha1}"
            nodes.append({
                "id": node_id,
                "type": "mailbox",
                "label": info.get("mailbox_name", sha1),
                "sha1": sha1,
                "source_type": "email",
            })
            node_ids.add(node_id)
        if cursor == 0:
            break

    # Scan emails
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:email:*", count=100)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            node_id = f"email:{sha1}"
            nodes.append({
                "id": node_id,
                "type": "email",
                "label": info.get("subject", sha1),
                "sha1": sha1,
                "source_type": "email",
            })
            node_ids.add(node_id)
            # Link to mailbox if present
            mailbox_sha1 = info.get("mailbox_sha1")
            if mailbox_sha1:
                edges.append({"source": f"mailbox:{mailbox_sha1}", "target": node_id, "label": "contains_email"})
        if cursor == 0:
            break

    # Scan edges (edge:head:*)
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="edge:head:*", count=100)
        for k in keys:
            data = store.redis.hgetall(k)
            if not data:
                continue
            info = {dk.decode(): dv.decode() for dk, dv in data.items()}
            left = info.get("left", "")
            right = info.get("right", "")
            label = info.get("label", "edge")
            if left and right:
                edges.append({"source": left, "target": right, "label": label})
        if cursor == 0:
            break

    return {"nodes": nodes, "edges": edges}
