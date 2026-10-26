"""Ingest explicitly provided official PDF URLs; no crawling or CAPTCHA bypass."""

import argparse
import datetime
import hashlib
import json
import pathlib
import re
import uuid
from urllib.parse import urlparse

import fitz
import requests


ROOT = pathlib.Path(__file__).resolve().parent


def ingest(url, title, dtype, jurisdiction, publisher):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Only HTTPS source URLs are accepted")
    response = requests.get(
        url,
        timeout=45,
        headers={"User-Agent": "LegalResearchDataset/0.1 (manual URL ingestion)"},
    )
    response.raise_for_status()
    if len(response.content) > 40_000_000:
        raise ValueError("PDF exceeds 40MB cap")
    if not response.content.startswith(b"%PDF-"):
        raise ValueError("URL did not return a PDF")

    digest = hashlib.sha256(response.content).hexdigest()
    (ROOT / "raw").mkdir(exist_ok=True)
    (ROOT / "raw" / f"{digest}.pdf").write_bytes(response.content)
    document = fitz.open(stream=response.content, filetype="pdf")
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    document_id = str(uuid.uuid5(uuid.NAMESPACE_URL, url + "#" + digest))
    records = []
    for page_index, page in enumerate(document):
        text = re.sub(r"\s+", " ", page.get_text("text")).strip()
        if not text:
            continue
        for offset in range(0, len(text), 1800):
            segment = text[offset:offset + 1800].strip()
            if not segment:
                continue
            records.append({
                "id": f"{document_id}:{page_index + 1}:{offset // 1800}",
                "document_id": document_id,
                "document_type": dtype,
                "title": title,
                "act_number": None,
                "section": None,
                "court": None,
                "case_number": None,
                "neutral_citation": None,
                "jurisdiction": jurisdiction,
                "language": "en",
                "publication_date": None,
                "effective_from": None,
                "effective_to": None,
                "source_url": url,
                "source_publisher": publisher,
                "retrieved_at": now,
                "sha256": digest,
                "page_start": page_index + 1,
                "page_end": page_index + 1,
                "text": segment,
                "verification_status": "pending",
                "supersedes": [],
                "notes": "Automated extraction: requires legal review and section-aware splitting",
            })

    (ROOT / "output").mkdir(exist_ok=True)
    path = ROOT / "output" / f"{digest}.jsonl"
    with path.open("w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"Saved {len(records)} pending-review records to {path}")
    if not records:
        print("No selectable text; OCR and review required.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument(
        "--type",
        required=True,
        choices=["constitution", "act", "rule", "regulation", "notification", "judgment", "order", "amendment", "ordinance", "other"],
    )
    parser.add_argument("--jurisdiction", default="India")
    parser.add_argument("--publisher", required=True)
    arguments = parser.parse_args()
    ingest(arguments.url, arguments.title, arguments.type, arguments.jurisdiction, arguments.publisher)
