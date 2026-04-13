"""Microsoft SQL Server metadata collector – extracts schema metadata from MSSQL tables."""
import pymssql


def collect_mssql_metadata(host: str, port: int, user: str, password: str,
                           database: str, table: str, schema: str = "dbo") -> dict:
    """Connect to SQL Server and return column-level metadata for the given table."""
    conn = None
    try:
        conn = pymssql.connect(
            server=host, port=port, user=user, password=password, database=database,
        )
        cursor = conn.cursor(as_dict=True)

        # Column metadata from INFORMATION_SCHEMA
        cursor.execute(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, "
            "CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, "
            "ORDINAL_POSITION "
            "FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
            "ORDER BY ORDINAL_POSITION",
            (schema, table),
        )
        columns = cursor.fetchall()

        # Primary key columns
        cursor.execute(
            "SELECT c.COLUMN_NAME "
            "FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc "
            "JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE c "
            "  ON tc.CONSTRAINT_NAME = c.CONSTRAINT_NAME "
            "  AND tc.TABLE_SCHEMA = c.TABLE_SCHEMA "
            "WHERE tc.TABLE_SCHEMA = %s AND tc.TABLE_NAME = %s "
            "  AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'",
            (schema, table),
        )
        pk_columns = {row["COLUMN_NAME"] for row in cursor.fetchall()}

        # Row count
        cursor.execute(
            "SELECT SUM(p.rows) AS row_count "
            "FROM sys.tables t "
            "JOIN sys.schemas s ON t.schema_id = s.schema_id "
            "JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1) "
            "WHERE s.name = %s AND t.name = %s",
            (schema, table),
        )
        row_info = cursor.fetchone() or {}

        # Table create/modify dates
        cursor.execute(
            "SELECT t.create_date, t.modify_date "
            "FROM sys.tables t "
            "JOIN sys.schemas s ON t.schema_id = s.schema_id "
            "WHERE s.name = %s AND t.name = %s",
            (schema, table),
        )
        date_info = cursor.fetchone() or {}

        # Index metadata
        cursor.execute(
            "SELECT i.name AS index_name, c.name AS column_name, "
            "i.is_unique, i.type_desc "
            "FROM sys.indexes i "
            "JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id "
            "JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id "
            "JOIN sys.tables t ON i.object_id = t.object_id "
            "JOIN sys.schemas s ON t.schema_id = s.schema_id "
            "WHERE s.name = %s AND t.name = %s AND i.name IS NOT NULL",
            (schema, table),
        )
        raw_indexes = cursor.fetchall()
        indexes = [
            {
                "name": idx["index_name"],
                "column": idx["column_name"],
                "unique": bool(idx["is_unique"]),
                "type": idx["type_desc"],
            }
            for idx in raw_indexes
        ]

        cursor.close()
        return {
            "source_type": "mssql",
            "database": database,
            "schema": schema,
            "table": table,
            "row_count": row_info.get("row_count", 0),
            "created_at": str(date_info.get("create_date", "")),
            "updated_at": str(date_info.get("modify_date", "")),
            "columns": [
                {
                    "name": c["COLUMN_NAME"],
                    "data_type": c["DATA_TYPE"],
                    "nullable": c["IS_NULLABLE"] == "YES",
                    "key": "PRI" if c["COLUMN_NAME"] in pk_columns else "",
                    "default": str(c["COLUMN_DEFAULT"]) if c["COLUMN_DEFAULT"] is not None else None,
                    "max_length": c["CHARACTER_MAXIMUM_LENGTH"],
                    "precision": c["NUMERIC_PRECISION"],
                    "scale": c["NUMERIC_SCALE"],
                    "position": c["ORDINAL_POSITION"],
                }
                for c in columns
            ],
            "indexes": indexes,
        }
    except Exception as e:
        raise RuntimeError(f"SQL Server connection error: {e}") from e
    finally:
        if conn:
            conn.close()
