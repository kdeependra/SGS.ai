"""CSV metadata collector – extracts structural metadata from a CSV file."""
import csv
import os
from io import StringIO


def _infer_type(values: list[str]) -> str:
    """Infer a simple type from a sample of non-empty string values."""
    int_count = float_count = 0
    for v in values:
        v = v.strip()
        if not v:
            continue
        try:
            int(v)
            int_count += 1
            continue
        except ValueError:
            pass
        try:
            float(v)
            float_count += 1
        except ValueError:
            pass
    total = len([v for v in values if v.strip()])
    if total == 0:
        return "unknown"
    if int_count == total:
        return "integer"
    if (int_count + float_count) == total:
        return "float"
    return "string"


def collect_csv_metadata(file_path: str | None = None, content: str | None = None,
                         file_name: str | None = None, sample_rows: int = 100) -> dict:
    """Extract metadata from a CSV file path or raw content string."""
    if file_path:
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"CSV file not found: {file_path}")
        with open(file_path, newline="", encoding="utf-8-sig") as f:
            text = f.read()
        display_name = file_name or os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
    elif content is not None:
        text = content
        display_name = file_name or "uploaded.csv"
        file_size = len(content.encode("utf-8"))
    else:
        raise ValueError("Provide either file_path or content")

    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(text[:8192])
    except csv.Error:
        dialect = csv.excel

    reader = csv.reader(StringIO(text), dialect)
    rows = list(reader)

    if not rows:
        return {
            "source_type": "csv",
            "file_name": display_name,
            "file_size": file_size,
            "row_count": 0,
            "columns": [],
        }

    headers = rows[0]
    data_rows = rows[1:]
    total_rows = len(data_rows)
    sample = data_rows[:sample_rows]

    columns = []
    for idx, header in enumerate(headers):
        sample_values = [r[idx] if idx < len(r) else "" for r in sample]
        null_count = sum(1 for v in sample_values if v.strip() == "")
        unique_values = len(set(v.strip() for v in sample_values if v.strip()))
        inferred = _infer_type(sample_values)
        columns.append({
            "name": header,
            "position": idx,
            "inferred_type": inferred,
            "null_count_sample": null_count,
            "unique_count_sample": unique_values,
            "sample_size": len(sample_values),
        })

    # Derive table name from file name: filename_1
    base_name = display_name.rsplit(".", 1)[0] if "." in display_name else display_name
    tables = [{
        "table": f"{base_name}_1",
        "row_count": total_rows,
        "columns": columns,
    }]

    return {
        "source_type": "csv",
        "file_name": display_name,
        "file_size": file_size,
        "delimiter": getattr(dialect, "delimiter", ","),
        "row_count": total_rows,
        "column_count": len(headers),
        "columns": columns,
        "tables": tables,
    }
