#!/usr/bin/env python3
"""Download allow-listed official Indian tax sources and build a text corpus."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request


ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "knowledge" / "tax"
RAW = KNOWLEDGE / "raw"
TEXT = KNOWLEDGE / "text"
MANIFEST = KNOWLEDGE / "sources.json"
INDEX = KNOWLEDGE / "chunks.jsonl"


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "CoVakeelTaxCorpus/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        content_type = response.headers.get("Content-Type", "")
        data = response.read()
    if not data.startswith(b"%PDF"):
        raise RuntimeError(f"Expected PDF from {url}; received {content_type}")
    temporary = destination.with_suffix(".download")
    temporary.write_bytes(data)
    temporary.replace(destination)


def clean_text(value: str) -> str:
    value = value.replace("\x0c", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def chunks(value: str, size: int = 2400, overlap: int = 300):
    start = 0
    while start < len(value):
        end = min(len(value), start + size)
        if end < len(value):
            boundary = value.rfind("\n", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunk = value[start:end].strip()
        if chunk:
            yield chunk
        if end >= len(value):
            break
        start = max(start + 1, end - overlap)


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    TEXT.mkdir(parents=True, exist_ok=True)
    sources = json.loads(MANIFEST.read_text(encoding="utf-8"))
    records = []
    downloaded_at = datetime.now(timezone.utc).isoformat()

    for source in sources:
        pdf_path = RAW / source["filename"]
        try:
            if not pdf_path.exists():
                print(f"Downloading {source['title']}…", flush=True)
                download(source["url"], pdf_path)
        except Exception as error:
            source["status"] = "external_only"
            source["download_error"] = f"{type(error).__name__}: {error}"
            print(f"Skipped {source['title']}: {error}", flush=True)
            continue
        text_path = TEXT / f"{source['id']}.txt"
        subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), str(text_path)],
            check=True,
        )
        content = clean_text(text_path.read_text(encoding="utf-8", errors="replace"))
        for number, chunk in enumerate(chunks(content), start=1):
            records.append({
                "id": f"{source['id']}:{number}",
                "source_id": source["id"],
                "title": source["title"],
                "authority": source["authority"],
                "kind": source["kind"],
                "url": source["url"],
                "downloaded_at": downloaded_at,
                "text": chunk,
            })
        source["sha256"] = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        source["bytes"] = pdf_path.stat().st_size
        source["downloaded_at"] = downloaded_at
        source["status"] = "downloaded"

    with INDEX.open("w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
    (KNOWLEDGE / "downloaded-sources.json").write_text(
        json.dumps(sources, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    downloaded = sum(source.get("status") == "downloaded" for source in sources)
    print(f"Built {len(records)} searchable chunks from {downloaded}/{len(sources)} official sources.")


if __name__ == "__main__":
    main()
