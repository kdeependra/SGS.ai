import json
import os
import anthropic
from core.meta_redis import RedisStore
from config import get_settings


def _get_api_key():
    settings = get_settings()
    return settings.anthropic_api_key or os.getenv("ANTHROPIC_API_KEY", "")

GRAPH_SCHEMA = """
The RedisGraph database "metadata" has the following schema:

Node labels:
- Database: properties {sha1, db_name, db_type, host, port}
- Table: properties {sha1, table_name, row_count, column_count, engine, schema_name}
- Column: properties {sha1, column_name, data_type, nullable, cardinality, key_type}
- File: properties {sha1, file_name, source_type, file_size, row_count, column_count, doc_type, word_count}
- Email: properties {sha1, subject}
- Mailbox: properties {sha1, mailbox_name}
- Folder: properties {sha1, folder_name}

Relationship types:
- (:Database)-[:HAS_TABLE]->(:Table)
- (:File)-[:HAS_TABLE]->(:Table)  // CSV files link to tables
- (:Table)-[:HAS_COLUMN]->(:Column)
- (:Folder)-[:CONTAINS_FILE]->(:File)
- (:Mailbox)-[:CONTAINS_EMAIL]->(:Email)
- (:Column)-[:FOREIGN_KEY {constraint}]->(:Column)
"""

SYSTEM_PROMPT = f"""You are a Cypher query generator for a metadata management system.
{GRAPH_SCHEMA}

Your job:
1. Convert the user's natural language question into a valid Cypher query.
2. Return ONLY the Cypher query — no explanation, no markdown, no backticks.
3. Always use RETURN to send back relevant node properties.
4. For broad queries, use OPTIONAL MATCH to include related nodes.
5. Use case-insensitive matching with toLower() for text searches.
12. CSV and document-sourced tables are linked via (:File)-[:HAS_TABLE]->(:Table). When querying tables or documents, ALWAYS match BOTH Database and File parents using separate OPTIONAL MATCH clauses AND return both d.db_name AS database AND fi.file_name AS file_name (not coalesce). Example: OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (fi:File)-[:HAS_TABLE]->(t) RETURN d.db_name AS database, fi.file_name AS file_name, ...
13. When the user asks about a document/file's metadata or structure, find the File node AND traverse (:File)-[:HAS_TABLE]->(:Table)-[:HAS_COLUMN]->(:Column) to show its internal structure (headings for markdown, keys for JSON, tags for XML/HTML).
6. If the query asks about "tables with columns like X", match column_name.
7. If the query asks about relationships or foreign keys, traverse FOREIGN_KEY edges.
8. When the user asks for "metadata" or "details" of tables, ALWAYS include column details by traversing HAS_COLUMN and returning individual column rows (one row per column) with column_name and data_type. Do NOT use collect() — return flat rows so each column is a separate result row.
9. When showing table metadata, include: database, table_name, column_name, data_type, nullable, key_type, cardinality.
10. CRITICAL — "related tables": When the user asks for "related tables", "complete tables", or mentions multiple concepts (e.g. orders AND customers AND products), find BOTH the seed tables matching the keyword AND all tables connected via FOREIGN_KEY relationships (incoming and outgoing). Use UNION to combine: (a) seed tables + columns, (b) tables that seed tables reference via outgoing FK, (c) tables that reference seed tables via incoming FK. This ensures the full relational neighborhood is returned.
11. For relational/related queries, always return: database, table_name, row_count, column_name, data_type, nullable, key_type, cardinality.

Examples:
User: "show me all tables in ecommerce database"
MATCH (d:Database {{db_name: 'ecommerce'}})-[:HAS_TABLE]->(t:Table) RETURN t.table_name AS table_name, t.row_count AS row_count, t.column_count AS column_count

User: "find columns with email"
MATCH (c:Column) WHERE toLower(c.column_name) CONTAINS 'email' MATCH (t:Table)-[:HAS_COLUMN]->(c) OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) RETURN d.db_name AS database, t.table_name AS table_name, c.column_name AS column_name, c.data_type AS data_type

User: "show foreign key relationships"
MATCH (c1:Column)-[fk:FOREIGN_KEY]->(c2:Column) MATCH (t1:Table)-[:HAS_COLUMN]->(c1) MATCH (t2:Table)-[:HAS_COLUMN]->(c2) RETURN t1.table_name AS from_table, c1.column_name AS from_column, t2.table_name AS to_table, c2.column_name AS to_column

User: "how many tables are there"
MATCH (t:Table) RETURN count(t) AS total_tables

User: "show me customer related tables and metadata"
MATCH (t:Table) WHERE toLower(t.table_name) CONTAINS 'customer' OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) RETURN d.db_name AS database, t.table_name AS table_name, t.row_count AS row_count, c.column_name AS column_name, c.data_type AS data_type, c.key_type AS key_type, c.nullable AS nullable, c.cardinality AS cardinality

User: "show me complete order related tables and metadata which have order info price and customer"
MATCH (t:Table) WHERE toLower(t.table_name) CONTAINS 'order' OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) RETURN d.db_name AS database, t.table_name AS table_name, t.row_count AS row_count, c.column_name AS column_name, c.data_type AS data_type, c.nullable AS nullable, c.key_type AS key_type, c.cardinality AS cardinality UNION MATCH (seed:Table) WHERE toLower(seed.table_name) CONTAINS 'order' MATCH (seed)-[:HAS_COLUMN]->(:Column)-[:FOREIGN_KEY]->(:Column)<-[:HAS_COLUMN]-(t:Table) OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) RETURN d.db_name AS database, t.table_name AS table_name, t.row_count AS row_count, c.column_name AS column_name, c.data_type AS data_type, c.nullable AS nullable, c.key_type AS key_type, c.cardinality AS cardinality UNION MATCH (seed:Table) WHERE toLower(seed.table_name) CONTAINS 'order' MATCH (seed)-[:HAS_COLUMN]->(:Column)<-[:FOREIGN_KEY]-(:Column)<-[:HAS_COLUMN]-(t:Table) OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) RETURN d.db_name AS database, t.table_name AS table_name, t.row_count AS row_count, c.column_name AS column_name, c.data_type AS data_type, c.nullable AS nullable, c.key_type AS key_type, c.cardinality AS cardinality

User: "show me product related tables with all relationships"
MATCH (t:Table) WHERE toLower(t.table_name) CONTAINS 'product' OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) RETURN d.db_name AS database, t.table_name AS table_name, t.row_count AS row_count, c.column_name AS column_name, c.data_type AS data_type, c.nullable AS nullable, c.key_type AS key_type, c.cardinality AS cardinality UNION MATCH (seed:Table) WHERE toLower(seed.table_name) CONTAINS 'product' MATCH (seed)-[:HAS_COLUMN]->(:Column)-[:FOREIGN_KEY]->(:Column)<-[:HAS_COLUMN]-(t:Table) OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) RETURN d.db_name AS database, t.table_name AS table_name, t.row_count AS row_count, c.column_name AS column_name, c.data_type AS data_type, c.nullable AS nullable, c.key_type AS key_type, c.cardinality AS cardinality UNION MATCH (seed:Table) WHERE toLower(seed.table_name) CONTAINS 'product' MATCH (seed)-[:HAS_COLUMN]->(:Column)<-[:FOREIGN_KEY]-(:Column)<-[:HAS_COLUMN]-(t:Table) OPTIONAL MATCH (d:Database)-[:HAS_TABLE]->(t) OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column) RETURN d.db_name AS database, t.table_name AS table_name, t.row_count AS row_count, c.column_name AS column_name, c.data_type AS data_type, c.nullable AS nullable, c.key_type AS key_type, c.cardinality AS cardinality
"""


def sync_metadata_to_graph(store: RedisStore) -> dict:
    """Populate RedisGraph 'metadata' from Redis hash keys."""
    pipe = store.redis.pipeline()
    commands = []
    node_count = 0
    edge_count = 0

    # Clear existing graph
    try:
        store.redis.execute_command("GRAPH.DELETE", "metadata")
    except Exception:
        pass

    # Create constraint indices
    for label in ["Database", "Table", "Column", "File", "Email", "Mailbox", "Folder"]:
        try:
            store.redis.execute_command(
                "GRAPH.QUERY", "metadata",
                f"CREATE INDEX FOR (n:{label}) ON (n.sha1)"
            )
        except Exception:
            pass

    # --- Databases ---
    db_map = {}
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:db:*", count=200)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = {dk.decode(): dv.decode() for dk, dv in store.redis.hgetall(k).items()}
            if not data:
                continue
            db_map[sha1] = data
            q = (
                f"CREATE (:Database {{sha1: '{sha1}', "
                f"db_name: '{_esc(data.get('db_name', ''))}', "
                f"db_type: '{_esc(data.get('db_type', ''))}', "
                f"host: '{_esc(data.get('host', ''))}', "
                f"port: '{_esc(data.get('port', ''))}' }})"
            )
            store.redis.execute_command("GRAPH.QUERY", "metadata", q)
            node_count += 1
        if cursor == 0:
            break

    # --- Files (before Tables so CSV tables can link to File parent) ---
    file_map = {}
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:file:*", count=200)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = {dk.decode(): dv.decode() for dk, dv in store.redis.hgetall(k).items()}
            if not data:
                continue
            file_map[sha1] = data
            q = (
                f"CREATE (:File {{sha1: '{sha1}', "
                f"file_name: '{_esc(data.get('file_name', ''))}', "
                f"source_type: '{_esc(data.get('source_type', ''))}', "
                f"file_size: {int(data.get('file_size', 0))}, "
                f"row_count: {int(data.get('row_count', 0))}, "
                f"column_count: {int(data.get('column_count', 0))}, "
                f"doc_type: '{_esc(data.get('doc_type', ''))}', "
                f"word_count: {int(data.get('word_count', 0))} }})"
            )
            store.redis.execute_command("GRAPH.QUERY", "metadata", q)
            node_count += 1
            folder_sha1 = data.get("folder_sha1")
            if folder_sha1:
                try:
                    eq = (
                        f"MATCH (f:Folder {{sha1: '{folder_sha1}'}}), (fi:File {{sha1: '{sha1}'}}) "
                        f"CREATE (f)-[:CONTAINS_FILE]->(fi)"
                    )
                    store.redis.execute_command("GRAPH.QUERY", "metadata", eq)
                    edge_count += 1
                except Exception:
                    pass
        if cursor == 0:
            break

    # --- Tables ---
    table_map = {}
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:table:*", count=200)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = {dk.decode(): dv.decode() for dk, dv in store.redis.hgetall(k).items()}
            if not data:
                continue
            table_map[sha1] = data
            q = (
                f"CREATE (:Table {{sha1: '{sha1}', "
                f"table_name: '{_esc(data.get('table_name', ''))}', "
                f"row_count: {int(data.get('row_count', 0))}, "
                f"column_count: {int(data.get('column_count', 0))}, "
                f"engine: '{_esc(data.get('engine', ''))}', "
                f"schema_name: '{_esc(data.get('schema_name', ''))}' }})"
            )
            store.redis.execute_command("GRAPH.QUERY", "metadata", q)
            node_count += 1
            # Link to parent database or file
            db_sha1 = data.get("db_sha1", "")
            if db_sha1 and db_sha1 in db_map:
                eq = (
                    f"MATCH (d:Database {{sha1: '{db_sha1}'}}), (t:Table {{sha1: '{sha1}'}}) "
                    f"CREATE (d)-[:HAS_TABLE]->(t)"
                )
                store.redis.execute_command("GRAPH.QUERY", "metadata", eq)
                edge_count += 1
            elif db_sha1 and db_sha1 in file_map:
                eq = (
                    f"MATCH (fi:File {{sha1: '{db_sha1}'}}), (t:Table {{sha1: '{sha1}'}}) "
                    f"CREATE (fi)-[:HAS_TABLE]->(t)"
                )
                store.redis.execute_command("GRAPH.QUERY", "metadata", eq)
                edge_count += 1
        if cursor == 0:
            break

    # --- Columns ---
    col_map = {}
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:column:*", count=200)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = {dk.decode(): dv.decode() for dk, dv in store.redis.hgetall(k).items()}
            if not data:
                continue
            col_map[sha1] = data
            q = (
                f"CREATE (:Column {{sha1: '{sha1}', "
                f"column_name: '{_esc(data.get('column_name', ''))}', "
                f"data_type: '{_esc(data.get('data_type', ''))}', "
                f"nullable: '{_esc(data.get('nullable', ''))}', "
                f"cardinality: {int(data.get('cardinality', 0))}, "
                f"key_type: '{_esc(data.get('key', ''))}' }})"
            )
            store.redis.execute_command("GRAPH.QUERY", "metadata", q)
            node_count += 1
            # Link to parent table
            table_sha1 = data.get("table_sha1", "")
            if table_sha1 and table_sha1 in table_map:
                eq = (
                    f"MATCH (t:Table {{sha1: '{table_sha1}'}}), (c:Column {{sha1: '{sha1}'}}) "
                    f"CREATE (t)-[:HAS_COLUMN]->(c)"
                )
                store.redis.execute_command("GRAPH.QUERY", "metadata", eq)
                edge_count += 1
        if cursor == 0:
            break

    # --- Foreign key edges between columns ---
    for tbl_sha1, tbl_data in table_map.items():
        fk_raw = tbl_data.get("foreign_keys", "[]")
        try:
            fk_list = json.loads(fk_raw)
        except Exception:
            continue
        for fk in fk_list:
            from_col = fk.get("column", "")
            to_table = fk.get("references_table", "")
            to_col = fk.get("references_column", "")
            constraint = fk.get("constraint", "")
            # Find SHA1s by name
            from_sha1 = _find_col_sha1(col_map, tbl_sha1, from_col)
            to_tbl_sha1 = _find_table_sha1(table_map, to_table)
            to_sha1 = _find_col_sha1(col_map, to_tbl_sha1, to_col) if to_tbl_sha1 else None
            if from_sha1 and to_sha1:
                eq = (
                    f"MATCH (c1:Column {{sha1: '{from_sha1}'}}), (c2:Column {{sha1: '{to_sha1}'}}) "
                    f"CREATE (c1)-[:FOREIGN_KEY {{constraint: '{_esc(constraint)}'}}]->(c2)"
                )
                store.redis.execute_command("GRAPH.QUERY", "metadata", eq)
                edge_count += 1

    # --- Folders ---
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:folder:*", count=200)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = {dk.decode(): dv.decode() for dk, dv in store.redis.hgetall(k).items()}
            if not data:
                continue
            q = (
                f"CREATE (:Folder {{sha1: '{sha1}', "
                f"folder_name: '{_esc(data.get('folder_name', ''))}' }})"
            )
            store.redis.execute_command("GRAPH.QUERY", "metadata", q)
            node_count += 1
        if cursor == 0:
            break

    # --- Mailboxes ---
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:mailbox:*", count=200)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = {dk.decode(): dv.decode() for dk, dv in store.redis.hgetall(k).items()}
            if not data:
                continue
            q = (
                f"CREATE (:Mailbox {{sha1: '{sha1}', "
                f"mailbox_name: '{_esc(data.get('mailbox_name', ''))}' }})"
            )
            store.redis.execute_command("GRAPH.QUERY", "metadata", q)
            node_count += 1
        if cursor == 0:
            break

    # --- Emails ---
    cursor = 0
    while True:
        cursor, keys = store.redis.scan(cursor, match="meta:email:*", count=200)
        for k in keys:
            sha1 = k.decode().split(":")[-1]
            data = {dk.decode(): dv.decode() for dk, dv in store.redis.hgetall(k).items()}
            if not data:
                continue
            q = (
                f"CREATE (:Email {{sha1: '{sha1}', "
                f"subject: '{_esc(data.get('subject', ''))}' }})"
            )
            store.redis.execute_command("GRAPH.QUERY", "metadata", q)
            node_count += 1
            mailbox_sha1 = data.get("mailbox_sha1")
            if mailbox_sha1:
                try:
                    eq = (
                        f"MATCH (m:Mailbox {{sha1: '{mailbox_sha1}'}}), (e:Email {{sha1: '{sha1}'}}) "
                        f"CREATE (m)-[:CONTAINS_EMAIL]->(e)"
                    )
                    store.redis.execute_command("GRAPH.QUERY", "metadata", eq)
                    edge_count += 1
                except Exception:
                    pass
        if cursor == 0:
            break

    return {"nodes_created": node_count, "edges_created": edge_count, "status": "synced"}


def nlp_to_cypher(prompt: str) -> str:
    """Use Anthropic to convert a natural language prompt into a Cypher query."""
    api_key = _get_api_key()
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    client = anthropic.Anthropic(api_key=api_key)
    last_err = None
    for attempt in range(3):
        try:
            message = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            cypher = ""
            for block in message.content:
                if block.type == "text":
                    cypher += block.text
            return cypher.strip()
        except anthropic.OverloadedError as e:
            last_err = e
            import time
            time.sleep(2 ** attempt)
    raise last_err


def execute_cypher(store: RedisStore, cypher: str) -> dict:
    """Execute a Cypher query against RedisGraph 'metadata' and return structured results."""
    try:
        raw = store.redis.execute_command("GRAPH.QUERY", "metadata", cypher)
    except Exception as e:
        return {"error": str(e), "columns": [], "rows": [], "stats": ""}

    # Parse RedisGraph response: [[headers], [row1], [row2], ...], [stats]
    if not raw or not isinstance(raw, list):
        return {"columns": [], "rows": [], "stats": ""}

    headers = []
    rows = []
    stats = ""

    if len(raw) >= 1 and isinstance(raw[0], list):
        headers = [h.decode() if isinstance(h, bytes) else str(h) for h in raw[0]]

    if len(raw) >= 2 and isinstance(raw[1], list):
        for row in raw[1]:
            parsed_row = []
            if isinstance(row, list):
                for cell in row:
                    parsed_row.append(_parse_cell(cell))
            else:
                parsed_row.append(_parse_cell(row))
            rows.append(parsed_row)

    if len(raw) >= 3:
        stats_list = raw[-1]
        if isinstance(stats_list, list):
            stats = "; ".join(
                s.decode() if isinstance(s, bytes) else str(s)
                for s in stats_list
            )

    return {"columns": headers, "rows": rows, "stats": stats}


def nlp_search(store: RedisStore, prompt: str) -> dict:
    """Full NLP search pipeline: prompt → Cypher → execute → results + graph."""
    cypher = nlp_to_cypher(prompt)
    result = execute_cypher(store, cypher)
    # Build graph data from results for frontend visualization
    graph = _build_result_graph(store, result, cypher)
    return {
        "prompt": prompt,
        "cypher": cypher,
        "result": result,
        "graph": graph,
    }


def _build_result_graph(store: RedisStore, result: dict, cypher: str) -> dict:
    """Build a graph visualization from Cypher results by extracting mentioned nodes."""
    nodes = []
    edges = []
    seen_ids = set()

    if result.get("error"):
        return {"nodes": nodes, "edges": edges}

    columns = result.get("columns", [])
    rows = result.get("rows", [])

    # Heuristic: scan result columns/rows for sha1 values and known names
    # to build a subgraph
    sha1_set = set()
    name_map = {}  # column_header → list of values

    for i, col in enumerate(columns):
        name_map[col] = []
        for row in rows:
            if i < len(row):
                val = row[i]
                name_map[col].append(val)
                # Check if it looks like a sha1
                if isinstance(val, str) and len(val) == 40 and all(c in '0123456789abcdef' for c in val):
                    sha1_set.add(val)

    # Try to match result data back to nodes
    # Also extract node info directly from result columns
    for row in rows:
        row_dict = {}
        for i, col in enumerate(columns):
            if i < len(row):
                row_dict[col] = row[i]

        # Detect node types from column names
        db_name = row_dict.get("database") or row_dict.get("db_name") or row_dict.get("d.db_name")
        file_name = row_dict.get("file_name") or row_dict.get("fi.file_name")
        source_name = row_dict.get("source")  # coalesce(d.db_name, fi.file_name) AS source
        table_name = row_dict.get("table_name") or row_dict.get("t.table_name")
        col_name = row_dict.get("column_name") or row_dict.get("c.column_name")

        # Normalize nulls (RedisGraph returns None/null as string "None")
        if db_name in (None, "None", "null", ""):
            db_name = None
        if file_name in (None, "None", "null", ""):
            file_name = None
        if source_name in (None, "None", "null", ""):
            source_name = None
        if table_name in (None, "None", "null", ""):
            table_name = None
        if col_name in (None, "None", "null", ""):
            col_name = None

        # Determine parent: database, file, or coalesced source
        parent_label = db_name or source_name
        parent_type = "database"
        parent_prefix = "db"
        if not parent_label and file_name:
            parent_label = file_name
            parent_type = "file"
            parent_prefix = "file"
        elif file_name and not db_name:
            # source was from file, override type
            parent_label = file_name
            parent_type = "file"
            parent_prefix = "file"

        if parent_label and parent_label not in seen_ids:
            nodes.append({"id": f"{parent_prefix}:{parent_label}", "type": parent_type, "label": str(parent_label)})
            seen_ids.add(parent_label)

        if table_name and table_name not in seen_ids:
            nodes.append({"id": f"tbl:{table_name}", "type": "table", "label": str(table_name)})
            seen_ids.add(table_name)
            if parent_label:
                edges.append({"source": f"{parent_prefix}:{parent_label}", "target": f"tbl:{table_name}", "label": "HAS_TABLE"})

        if col_name and table_name:
            col_id = f"col:{table_name}.{col_name}"
            if col_id not in seen_ids:
                nodes.append({"id": col_id, "type": "column", "label": str(col_name)})
                seen_ids.add(col_id)
                edges.append({"source": f"tbl:{table_name}", "target": col_id, "label": "HAS_COLUMN"})
        elif col_name and col_name not in seen_ids:
            nodes.append({"id": f"col:{col_name}", "type": "column", "label": str(col_name)})
            seen_ids.add(col_name)

        # Handle collected columns (e.g. collect(c.column_name) AS columns)
        col_list = row_dict.get("columns") or row_dict.get("column_names")
        if isinstance(col_list, list) and table_name:
            for cn in col_list:
                cn_str = str(cn)
                col_id = f"col:{table_name}.{cn_str}"
                if col_id not in seen_ids:
                    nodes.append({"id": col_id, "type": "column", "label": cn_str})
                    seen_ids.add(col_id)
                    edges.append({"source": f"tbl:{table_name}", "target": col_id, "label": "HAS_COLUMN"})

        # Handle collected data types alongside columns
        dt_list = row_dict.get("data_types") or row_dict.get("types")
        if isinstance(dt_list, list) and isinstance(col_list, list) and table_name:
            for idx, cn in enumerate(col_list):
                cn_str = str(cn)
                col_id = f"col:{table_name}.{cn_str}"
                if idx < len(dt_list):
                    # Update the existing node label to include data type
                    for node in nodes:
                        if node["id"] == col_id:
                            node["label"] = f"{cn_str} ({dt_list[idx]})"
                            break

        # Handle FK results
        from_table = row_dict.get("from_table")
        to_table = row_dict.get("to_table")
        from_col = row_dict.get("from_column")
        to_col = row_dict.get("to_column")
        if from_table and to_table:
            if from_table not in seen_ids:
                nodes.append({"id": f"tbl:{from_table}", "type": "table", "label": str(from_table)})
                seen_ids.add(from_table)
            if to_table not in seen_ids:
                nodes.append({"id": f"tbl:{to_table}", "type": "table", "label": str(to_table)})
                seen_ids.add(to_table)
            fk_label = f"{from_col} → {to_col}" if from_col and to_col else "FK"
            edges.append({"source": f"tbl:{from_table}", "target": f"tbl:{to_table}", "label": fk_label})

        # Handle generic count-style results (no graph needed)
        # Just add a summary node
        if not db_name and not table_name and not col_name and not from_table:
            summary_parts = []
            for col_h in columns:
                v = row_dict.get(col_h)
                if v is not None:
                    summary_parts.append(f"{col_h}: {v}")
            if summary_parts:
                summary_id = "|".join(summary_parts)
                if summary_id not in seen_ids:
                    nodes.append({"id": f"res:{summary_id}", "type": "result", "label": " | ".join(summary_parts)})
                    seen_ids.add(summary_id)

    return _enrich_fk_edges(store, nodes, edges, seen_ids)


def _enrich_fk_edges(store: RedisStore, nodes: list, edges: list, seen_ids: set) -> dict:
    """Auto-discover FK relationships between tables in the graph and add FK edges."""
    # Collect all table names from current nodes
    table_names = [n["label"] for n in nodes if n["type"] == "table"]
    if len(table_names) < 2:
        return {"nodes": nodes, "edges": edges}

    # Query RedisGraph for FK relationships between these tables
    try:
        conditions = " OR ".join(
            f"t1.table_name = '{_esc(t)}'" for t in table_names
        )
        fk_cypher = (
            f"MATCH (t1:Table)-[:HAS_COLUMN]->(c1:Column)-[:FOREIGN_KEY]->(c2:Column)<-[:HAS_COLUMN]-(t2:Table) "
            f"WHERE ({conditions}) "
            f"RETURN t1.table_name AS from_table, c1.column_name AS from_column, "
            f"t2.table_name AS to_table, c2.column_name AS to_column"
        )
        raw = store.redis.execute_command("GRAPH.QUERY", "metadata", fk_cypher)
        if raw and isinstance(raw, list) and len(raw) >= 2 and isinstance(raw[1], list):
            for row in raw[1]:
                if isinstance(row, list) and len(row) >= 4:
                    from_table = row[0].decode() if isinstance(row[0], bytes) else str(row[0])
                    from_col = row[1].decode() if isinstance(row[1], bytes) else str(row[1])
                    to_table = row[2].decode() if isinstance(row[2], bytes) else str(row[2])
                    to_col = row[3].decode() if isinstance(row[3], bytes) else str(row[3])
                    # Only add edge if both tables are in our node set
                    if from_table in table_names and to_table in table_names:
                        fk_edge_id = f"fk:{from_table}.{from_col}->{to_table}.{to_col}"
                        if fk_edge_id not in seen_ids:
                            edges.append({
                                "source": f"tbl:{from_table}",
                                "target": f"tbl:{to_table}",
                                "label": f"FK: {from_col} → {to_col}",
                            })
                            seen_ids.add(fk_edge_id)
    except Exception:
        pass  # FK enrichment is best-effort

    return {"nodes": nodes, "edges": edges}


# --- Helpers ---

def _esc(val: str) -> str:
    """Escape single quotes for Cypher strings."""
    return val.replace("\\", "\\\\").replace("'", "\\'")


def _find_col_sha1(col_map: dict, table_sha1: str, col_name: str) -> str | None:
    for sha1, data in col_map.items():
        if data.get("table_sha1") == table_sha1 and data.get("column_name") == col_name:
            return sha1
    return None


def _find_table_sha1(table_map: dict, table_name: str) -> str | None:
    for sha1, data in table_map.items():
        if data.get("table_name") == table_name:
            return sha1
    return None


def _parse_cell(cell):
    """Parse a single RedisGraph result cell into a Python value."""
    if isinstance(cell, bytes):
        return cell.decode()
    if isinstance(cell, list):
        # Could be a node, edge, or array
        if len(cell) == 3 and isinstance(cell[0], int):
            # Scalar: [type, value] or node/edge
            return _parse_cell(cell[2]) if len(cell) > 2 else str(cell)
        return [_parse_cell(c) for c in cell]
    if isinstance(cell, (int, float)):
        return cell
    return str(cell)
