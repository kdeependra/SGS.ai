"""MySQL metadata collector – extracts schema metadata from a MySQL table or database."""
import re
import mysql.connector
from mysql.connector import Error

# Common stop-words to ignore when extracting keywords from the prompt
_STOP_WORDS = frozenset(
    "show me my the a an and or of for to in with from all get find list "
    "related tables table metadata data database db columns column schema "
    "information about give describe display what which their its".split()
)


def _extract_keywords(prompt: str) -> list[str]:
    """Extract meaningful keywords from a user prompt."""
    words = re.findall(r"[a-z0-9_]+", prompt.lower())
    return [w for w in words if w not in _STOP_WORDS and len(w) > 1]


def _table_matches(table_name: str, columns: list[dict],
                   foreign_keys: list[dict], keywords: list[str]) -> bool:
    """Return True if a table is relevant to any of the keywords.

    Matches against:
      - table name (substring)
      - column names (substring)
      - FK-referenced table names (substring)
    """
    tname_lower = table_name.lower()
    for kw in keywords:
        # Table name contains keyword
        if kw in tname_lower:
            return True
        # Any column name contains keyword
        for col in columns:
            if kw in col.get("name", "").lower():
                return True
        # Any FK references a table whose name contains the keyword
        for fk in foreign_keys:
            if kw in fk.get("references_table", "").lower():
                return True
    return False


def collect_mysql_metadata(host: str, port: int, user: str, password: str,
                           database: str, table: str = "",
                           prompt: str = "") -> dict:
    """Connect to MySQL and return metadata.

    If *table* is provided, return column-level metadata for that table.
    If *table* is empty, return a database overview listing all tables with
    their row counts, sizes, and column summaries.
    """
    conn = None
    try:
        conn = mysql.connector.connect(
            host=host, port=port, user=user, password=password, database=database,
        )
        cursor = conn.cursor(dictionary=True)

        if not table:
            return _collect_database_metadata(cursor, database, prompt)

        return _collect_table_metadata(cursor, database, table)
    except Error as e:
        raise RuntimeError(f"MySQL connection error: {e}") from e
    finally:
        if conn and conn.is_connected():
            conn.close()


def _collect_database_metadata(cursor, database: str, prompt: str = "") -> dict:
    """Return an overview of all tables in the database.

    When *prompt* is provided, only tables matching the prompt keywords
    (by table name, column name, or FK reference) are returned.
    """
    # All tables with stats
    cursor.execute(
        "SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, "
        "CREATE_TIME, UPDATE_TIME, TABLE_COMMENT, ENGINE "
        "FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' "
        "ORDER BY TABLE_NAME",
        (database,),
    )
    raw_tables = cursor.fetchall()

    # All columns grouped by table
    cursor.execute(
        "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY, IS_NULLABLE "
        "FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = %s "
        "ORDER BY TABLE_NAME, ORDINAL_POSITION",
        (database,),
    )
    raw_columns = cursor.fetchall()

    # Group columns by table
    cols_by_table: dict[str, list] = {}
    for c in raw_columns:
        tbl = c["TABLE_NAME"]
        cols_by_table.setdefault(tbl, []).append({
            "name": c["COLUMN_NAME"],
            "data_type": c["DATA_TYPE"],
            "key": c["COLUMN_KEY"],
            "nullable": c["IS_NULLABLE"] == "YES",
        })

    # All foreign keys
    cursor.execute(
        "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME "
        "FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE "
        "WHERE TABLE_SCHEMA = %s AND REFERENCED_TABLE_NAME IS NOT NULL "
        "ORDER BY TABLE_NAME",
        (database,),
    )
    raw_fks = cursor.fetchall()
    fks_by_table: dict[str, list] = {}
    for fk in raw_fks:
        tbl = fk["TABLE_NAME"]
        fks_by_table.setdefault(tbl, []).append({
            "column": fk["COLUMN_NAME"],
            "references_table": fk["REFERENCED_TABLE_NAME"],
            "references_column": fk["REFERENCED_COLUMN_NAME"],
            "constraint": fk["CONSTRAINT_NAME"],
        })

    tables = []
    total_rows = 0
    total_size = 0
    for t in raw_tables:
        tname = t["TABLE_NAME"]
        rows = t["TABLE_ROWS"] or 0
        data_len = t["DATA_LENGTH"] or 0
        idx_len = t["INDEX_LENGTH"] or 0
        total_rows += rows
        total_size += data_len + idx_len
        tables.append({
            "table": tname,
            "row_count": rows,
            "data_length": data_len,
            "index_length": idx_len,
            "engine": t.get("ENGINE", ""),
            "created_at": str(t.get("CREATE_TIME", "")),
            "updated_at": str(t.get("UPDATE_TIME", "")),
            "comment": t.get("TABLE_COMMENT", ""),
            "column_count": len(cols_by_table.get(tname, [])),
            "columns": cols_by_table.get(tname, []),
            "foreign_keys": fks_by_table.get(tname, []),
        })

    # Filter tables by prompt keywords if a prompt was provided
    keywords = _extract_keywords(prompt) if prompt else []
    if keywords:
        tables = [
            t for t in tables
            if _table_matches(t["table"], t["columns"], t["foreign_keys"], keywords)
        ]
        # Recalculate totals for filtered set
        total_rows = sum(t["row_count"] for t in tables)
        total_size = sum(t["data_length"] + t["index_length"] for t in tables)

    return {
        "source_type": "mysql",
        "database": database,
        "table": None,
        "table_count": len(tables),
        "total_rows": total_rows,
        "total_size_bytes": total_size,
        "tables": tables,
        "prompt": prompt if prompt else None,
        "filter_keywords": keywords if keywords else None,
    }


def _collect_table_metadata(cursor, database: str, table: str) -> dict:
    """Return column-level metadata for a single table."""
    # Column metadata from INFORMATION_SCHEMA
    cursor.execute(
        "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, "
        "CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, COLUMN_COMMENT "
        "FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
        "ORDER BY ORDINAL_POSITION",
        (database, table),
    )
    columns = cursor.fetchall()

    # Table-level stats
    cursor.execute(
        "SELECT TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, CREATE_TIME, UPDATE_TIME, TABLE_COMMENT "
        "FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
        (database, table),
    )
    table_info = cursor.fetchone() or {}

    # Index metadata
    cursor.execute("SHOW INDEX FROM `%s`.`%s`" % (database, table))
    raw_indexes = cursor.fetchall()
    indexes: list[dict] = []
    for idx in raw_indexes:
        indexes.append({
            "name": idx.get("Key_name"),
            "column": idx.get("Column_name"),
            "unique": idx.get("Non_unique") == 0,
            "type": idx.get("Index_type"),
        })

    return {
        "source_type": "mysql",
        "database": database,
        "table": table,
        "row_count": table_info.get("TABLE_ROWS", 0),
        "data_length": table_info.get("DATA_LENGTH", 0),
        "index_length": table_info.get("INDEX_LENGTH", 0),
        "created_at": str(table_info.get("CREATE_TIME", "")),
        "updated_at": str(table_info.get("UPDATE_TIME", "")),
        "table_comment": table_info.get("TABLE_COMMENT", ""),
        "columns": [
            {
                "name": c["COLUMN_NAME"],
                "data_type": c["DATA_TYPE"],
                "nullable": c["IS_NULLABLE"] == "YES",
                "key": c["COLUMN_KEY"],
                "default": str(c["COLUMN_DEFAULT"]) if c["COLUMN_DEFAULT"] is not None else None,
                "max_length": c["CHARACTER_MAXIMUM_LENGTH"],
                "precision": c["NUMERIC_PRECISION"],
                "scale": c["NUMERIC_SCALE"],
                "comment": c["COLUMN_COMMENT"],
            }
            for c in columns
        ],
        "indexes": indexes,
    }
