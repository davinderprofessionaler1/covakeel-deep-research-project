#!/usr/bin/env python3
"""Build review-only CoVakeel records from four pinned official PDFs.

This command never writes to the approved runtime index. Every generated
record is explicitly pending and retains the source PDF hash and page number.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name("source_manifest.json")
OUTPUT_ROOT = ROOT / "knowledge" / "phase1"
MAX_PDF_BYTES = 40 * 1024 * 1024
ALLOWED_HOSTS = {
    "www.legislative.gov.in",
    "legislative.gov.in",
    "www.indiacode.nic.in",
    "indiacode.nic.in",
    "www.indiacode.gov.in",
    "indiacode.gov.in",
    "www.mha.gov.in",
    "mha.gov.in",
    "delhipolice.mha.gov.in",
    "cdnbbsr.s3waas.gov.in",
}
# Gazette PDFs often print a short marginal heading before the provision number
# on the same extracted line (for example, ``Definitions.     2. In ...``).
HEADING_RE = re.compile(
    r"(?m)^(?:[ \t]{0,24}|.{1,70}?[ \t]{3,})(\d{1,3}[A-Z]?)\.[ \t]+([^\n]{3,180})$"
)
FOOTNOTE_PREFIXES = (
    "subs.", "ins.", "omitted", "rep.", "the constitution (", "for clause",
    "for sub-clause", "for article", "for section", "renumbered", "the words",
    "the figures", "the brackets", "clause (", "paragraph (", "entry ",
)
REQUIRED_FIELDS = {
    "id", "document_id", "document_type", "title", "jurisdiction",
    "language", "source_url", "source_publisher", "retrieved_at",
    "sha256", "text", "verification_status",
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False,
        prefix=f".{path.name}-", suffix=".tmp"
    ) as stream:
        temporary = Path(stream.name)
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def validate_official_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"Unapproved source URL: {url}")


def download_pdf(url: str) -> tuple[bytes, str]:
    validate_official_url(url)
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=1.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
    )
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=retry))
    response = session.get(
        url,
        timeout=(15, 45),
        stream=True,
        headers={"User-Agent": "CoVakeel-Legal-Research/1.0"},
    )
    response.raise_for_status()
    validate_official_url(response.url)
    content_length = response.headers.get("content-length")
    if content_length and int(content_length) > MAX_PDF_BYTES:
        raise ValueError(f"PDF is larger than {MAX_PDF_BYTES} bytes")
    parts: list[bytes] = []
    size = 0
    for part in response.iter_content(64 * 1024):
        if not part:
            continue
        size += len(part)
        if size > MAX_PDF_BYTES:
            raise ValueError(f"PDF exceeded {MAX_PDF_BYTES} bytes while downloading")
        parts.append(part)
    data = b"".join(parts)
    if not data.startswith(b"%PDF-"):
        raise ValueError("Official URL did not return a PDF")
    return data, response.url


def pdf_pages(pdf_path: Path) -> tuple[list[str], int]:
    if not shutil.which("pdftotext") or not shutil.which("pdfinfo"):
        raise RuntimeError("Poppler commands pdftotext and pdfinfo are required")
    info = subprocess.run(
        ["pdfinfo", str(pdf_path)], check=True, capture_output=True, text=True
    ).stdout
    match = re.search(r"(?m)^Pages:\s+(\d+)\s*$", info)
    if not match:
        raise RuntimeError(f"Could not determine page count for {pdf_path}")
    total = int(match.group(1))
    extracted = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    pages = extracted.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    if len(pages) < total:
        pages.extend([""] * (total - len(pages)))
    return pages[:total], total


def clean_page(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\x00", "").splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def section_segments(
    text: str, current: str | None, label: str, max_number: int | None = None
) -> tuple[list[tuple[str | None, str]], str | None]:
    matches = []
    for match in HEADING_RE.finditer(text):
        heading = match.group(2).strip()
        number_value = int(re.match(r"\d+", match.group(1)).group())
        # Reject common table/page artifacts while keeping conservative legal headings.
        if (
            heading.isdigit()
            or (max_number is not None and number_value > max_number)
            or len(heading.split()) > 28
            or heading.casefold().startswith(FOOTNOTE_PREFIXES)
        ):
            continue
        matches.append(match)
    if not matches:
        return [(current, text)], current
    segments: list[tuple[str | None, str]] = []
    if matches[0].start() > 0 and text[:matches[0].start()].strip():
        segments.append((current, text[:matches[0].start()].strip()))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        number = match.group(1)
        current = f"{label} {number}"
        segments.append((current, text[match.start():end].strip()))
    return segments, current


def bounded_parts(text: str, limit: int = 3500) -> list[str]:
    if len(text) <= limit:
        return [text]
    parts: list[str] = []
    remaining = text
    while len(remaining) > limit:
        cut = remaining.rfind("\n", 0, limit + 1)
        if cut < limit // 2:
            cut = remaining.rfind(" ", 0, limit + 1)
        if cut < limit // 2:
            cut = limit
        parts.append(remaining[:cut].strip())
        remaining = remaining[cut:].strip()
    if remaining:
        parts.append(remaining)
    return parts


def validate_record(record: dict) -> None:
    missing = REQUIRED_FIELDS - record.keys()
    if missing:
        raise ValueError(f"Generated record missing fields: {sorted(missing)}")
    if record["verification_status"] != "pending":
        raise ValueError("Phase 1 generator may create pending records only")
    if not re.fullmatch(r"[0-9a-f]{64}", record["sha256"]):
        raise ValueError("Invalid SHA-256 in generated record")
    if not record["text"].strip():
        raise ValueError("Generated record has empty text")


def build_document(spec: dict, retrieved_at: str) -> tuple[list[dict], dict]:
    data, final_url = download_pdf(spec["pdf_url"])
    digest = hashlib.sha256(data).hexdigest()
    document_id = f"{spec['slug']}-{digest[:12]}"
    raw_dir = OUTPUT_ROOT / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"{document_id}.pdf"
    if raw_path.exists() and raw_path.read_bytes() != data:
        raise RuntimeError(f"Hash-named raw file collision: {raw_path}")
    if not raw_path.exists():
        with tempfile.NamedTemporaryFile("wb", dir=raw_dir, delete=False, prefix=".pdf-") as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(raw_path)

    pages, total_pages = pdf_pages(raw_path)
    marker = spec["content_start_marker"]
    try:
        start_index = next(index for index, page in enumerate(pages) if marker in page)
    except StopIteration as error:
        raise RuntimeError(f"Content start marker was not found in {spec['slug']}: {marker}") from error
    records: list[dict] = []
    empty_pages: list[int] = []
    current_section: str | None = None
    structure_closed = False
    for page_number, raw_text in enumerate(pages[start_index:], start=start_index + 1):
        text = clean_page(raw_text)
        if len(text) < 30:
            empty_pages.append(page_number)
            continue
        end_marker = spec.get("structure_end_marker")
        marker_match = None
        if end_marker and not structure_closed:
            marker_match = re.search(
                rf"(?m)^[ \t]*(?:\d+[ \t]*)?\[?[ \t]*(?:THE[ \t]+)?"
                rf"{re.escape(end_marker)}[ \t\]]*$",
                text,
            )
        if marker_match:
            segments = []
            before = text[:marker_match.start()].strip()
            if before:
                before_segments, current_section = section_segments(
                    before,
                    current_section,
                    spec["structure_label"],
                    spec["max_structure_number"],
                )
                segments.extend(before_segments)
            current_section = spec["structure_after_label"]
            after = text[marker_match.start():].strip()
            if after:
                segments.append((current_section, after))
            structure_closed = True
        elif structure_closed:
            segments = [(current_section, text)]
        else:
            segments, current_section = section_segments(
                text,
                current_section,
                spec["structure_label"],
                spec["max_structure_number"],
            )
        page_chunk = 0
        for section, segment in segments:
            for part in bounded_parts(segment):
                if not part:
                    continue
                page_chunk += 1
                record = {
                    "id": f"{document_id}-p{page_number}-c{page_chunk}",
                    "document_id": document_id,
                    "document_type": spec["document_type"],
                    "title": spec["title"],
                    "act_number": spec["act_number"],
                    "section": section,
                    "court": None,
                    "case_number": None,
                    "neutral_citation": None,
                    "jurisdiction": "India",
                    "language": "en",
                    "publication_date": spec["publication_date"],
                    "effective_from": spec["effective_from"],
                    "effective_to": None,
                    "source_url": final_url,
                    "source_publisher": spec["source_publisher"],
                    "retrieved_at": retrieved_at,
                    "sha256": digest,
                    "page_start": page_number,
                    "page_end": page_number,
                    "text": part,
                    "verification_status": "pending",
                    "supersedes": [],
                    "notes": (
                        "Automated PDF extraction; NOT legally verified. The reviewer must "
                        "confirm text, article/section boundary, amendments, commencement, "
                        "repeals, schedules, footnotes and extraction completeness."
                    ),
                }
                validate_record(record)
                records.append(record)

    report = {
        "slug": spec["slug"],
        "title": spec["title"],
        "landing_url": spec["landing_url"],
        "requested_pdf_url": spec["pdf_url"],
        "final_pdf_url": final_url,
        "retrieved_at": retrieved_at,
        "sha256": digest,
        "bytes": len(data),
        "raw_pdf": str(raw_path.relative_to(ROOT)),
        "pages_total": total_pages,
        "front_matter_pages_skipped": start_index,
        "pages_processed": total_pages - start_index,
        "pages_with_text": total_pages - start_index - len(empty_pages),
        "pages_without_extractable_text": empty_pages,
        "pending_records": len(records),
        "status": "pending_legal_review",
    }
    return records, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the four-document CoVakeel Phase 1 staging set")
    parser.add_argument(
        "--documents", nargs="+", choices=["constitution", "bns", "bnss", "bsa"],
        default=["constitution", "bns", "bnss", "bsa"],
    )
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    selected = set(args.documents)
    specs = [item for item in manifest["documents"] if item["slug"] in selected]
    if len(specs) != len(selected):
        raise SystemExit("Manifest is missing one or more selected documents")

    retrieved_at = utc_now()
    all_records: list[dict] = []
    reports: list[dict] = []
    pending_dir = OUTPUT_ROOT / "pending"
    for spec in specs:
        records, report = build_document(spec, retrieved_at)
        if not records:
            raise RuntimeError(f"No records extracted from {spec['slug']}")
        lines = "".join(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n" for item in records)
        atomic_text(pending_dir / f"{spec['slug']}.pending.jsonl", lines)
        all_records.extend(records)
        reports.append(report)
        print(f"{spec['slug']}: {len(records)} pending records, {report['pages_total']} pages, sha256={report['sha256']}")

    combined = "".join(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n" for item in all_records)
    atomic_text(pending_dir / "phase1-all.pending.jsonl", combined)
    summary = {
        "generated_at": retrieved_at,
        "manifest": str(MANIFEST.relative_to(ROOT)),
        "verification_status": "pending",
        "documents": reports,
        "totals": {
            "documents": len(reports),
            "pages": sum(item["pages_total"] for item in reports),
            "pending_records": len(all_records),
            "pages_without_extractable_text": sum(len(item["pages_without_extractable_text"]) for item in reports),
        },
        "runtime_index_changed": False,
    }
    atomic_text(OUTPUT_ROOT / "extraction-report.json", json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    print(f"Combined pending set: {len(all_records)} records")
    print(f"Report: {OUTPUT_ROOT / 'extraction-report.json'}")
    print("Approved runtime index was not changed.")


if __name__ == "__main__":
    main()
