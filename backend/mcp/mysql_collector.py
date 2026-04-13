"""MySQL metadata collector – extracts schema metadata from a MySQL table."""
import mysql.connector
from mysql.connector import Error


def collect_mysql_metadata(host: str, port: int, user: str, password: str,
                           database: str, table: str) -> dict:
    """Connect to MySQL and return column-level metadata for the given table."""
    conn = None
    try:
        conn = mysql.connector.connect(
            host=host, port=port, user=user, password=password, database=database,
        )
        cursor = conn.cursor(dictionary=True)

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

        # Row count
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
            # raw dict keys may vary; normalise
            indexes.append({
                "name": idx.get("Key_name"),
                "column": idx.get("Column_name"),
                "unique": idx.get("Non_unique") == 0,
                "type": idx.get("Index_type"),
            })

        cursor.close()
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
    except Error as e:
        raise RuntimeError(f"MySQL connection error: {e}") from e
    finally:
        if conn and conn.is_connected():
            conn.close()
