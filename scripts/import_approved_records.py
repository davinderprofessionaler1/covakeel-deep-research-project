#!/usr/bin/env python3
"""Validate and replace CoVakeel's approved JSONL knowledge index."""

import argparse
import json
from pathlib import Path
import re
import tempfile


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "knowledge" / "approved" / "chunks.jsonl"
REQUIRED = {
    "id", "document_id", "document_type", "title", "jurisdiction", "language",
    "source_url", "source_publisher", "retrieved_at", "sha256", "text",
    "verification_status",
}
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def validate(record: object, source: Path, line_number: int) -> dict:
    location = f"{source}:{line_number}"
    if not isinstance(record, dict):
        raise ValueError(f"{location}: record must be a JSON object")
    missing = sorted(REQUIRED - record.keys())
    if missing:
        raise ValueError(f"{location}: missing fields: {', '.join(missing)}")
    if record["verification_status"] != "approved":
        raise ValueError(f"{location}: only verification_status=approved may be imported")
    for field in ("id", "document_id", "title", "source_url", "source_publisher", "text"):
        if not isinstance(record[field], str) or not record[field].strip():
            raise ValueError(f"{location}: {field} must be a non-empty string")
    if not record["source_url"].startswith("https://"):
        raise ValueError(f"{location}: source_url must use HTTPS")
    if not isinstance(record["sha256"], str) or not SHA256.fullmatch(record["sha256"]):
        raise ValueError(f"{location}: sha256 must be 64 lowercase hexadecimal characters")
    return record


def load(paths: list[Path]) -> list[dict]:
    records = []
    seen = set()
    for path in paths:
        with path.open(encoding="utf-8") as stream:
            for number, line in enumerate(stream, start=1):
                if not line.strip():
                    continue
                try:
                    raw = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError(f"{path}:{number}: invalid JSON: {error.msg}") from error
                record = validate(raw, path, number)
                if record["id"] in seen:
                    raise ValueError(f"{path}:{number}: duplicate record id {record['id']}")
                seen.add(record["id"])
                records.append(record)
    if not records:
        raise ValueError("No approved records were found")
    return records


def write_atomic(records: list[dict], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=output.parent, delete=False, prefix=".chunks-", suffix=".jsonl"
    ) as stream:
        temporary = Path(stream.name)
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(output)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import human-approved legal RAG records into CoVakeel"
    )
    parser.add_argument("jsonl", nargs="+", type=Path, help="Reviewed JSONL files")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    records = load(args.jsonl)
    write_atomic(records, args.output)
    documents = len({record["document_id"] for record in records})
    print(f"Imported {len(records)} approved records from {documents} documents to {args.output}")


if __name__ == "__main__":
    main()
