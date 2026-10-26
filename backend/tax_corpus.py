"""Strict retrieval over human-approved CoVakeel knowledge records."""

from collections import Counter
import json
from pathlib import Path
import re


TOKEN = re.compile(r"[a-zA-Z0-9]{2,}")
REFERENCE = re.compile(
    r"\b(article|section)\s+(\d+[a-z]?(?:\(\d+[a-z]?\))*)",
    re.IGNORECASE,
)
DOCUMENT_ALIASES = {
    "bns": "bharatiya nyaya sanhita",
    "bnss": "bharatiya nagarik suraksha sanhita",
    "bsa": "bharatiya sakshya adhiniyam",
    "cgst": "central goods and services tax",
}
STOP = {
    "about", "after", "also", "and", "are", "can", "does", "for", "from",
    "have", "how", "into", "is", "its", "may", "not", "of", "shall", "that", "the",
    "this", "under", "was", "what", "when", "where", "which", "with", "your",
}

KNOWLEDGE_REFUSAL_MESSAGE = (
    "This information is not available in the approved CoVakeel knowledge base."
)
PENDING_TEST_REFUSAL_MESSAGE = (
    "This information is not available in the CoVakeel Phase 1 test knowledge base."
)


def _tokens(value: str) -> Counter:
    return Counter(token for token in TOKEN.findall(value.casefold()) if token not in STOP)


class ApprovedCorpus:
    """Load only records explicitly marked approved.

    The loader accepts the schema supplied in ``indian_legal_rag_starter.zip``.
    Pending, rejected, malformed, and legacy records without a verification
    status are deliberately excluded.
    """

    def __init__(self, index_path: Path, allow_pending: bool = False) -> None:
        self.records = []
        self._record_positions = {}
        self.allow_pending = allow_pending
        self.approved_records = 0
        self.pending_records = 0
        self.rejected_records = 0
        self.invalid_records = 0
        self.index_path = index_path
        if index_path.exists():
            with index_path.open(encoding="utf-8") as stream:
                for line in stream:
                    if not line.strip():
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError:
                        self.invalid_records += 1
                        continue
                    status = record.get("verification_status")
                    if status == "pending":
                        self.pending_records += 1
                        if not self.allow_pending or not self._valid_record(record):
                            continue
                    if status == "rejected":
                        self.rejected_records += 1
                        continue
                    if status not in ({"approved", "pending"} if self.allow_pending else {"approved"}) or not self._valid_record(record):
                        self.invalid_records += 1
                        continue
                    if status == "approved":
                        self.approved_records += 1
                    searchable = " ".join(
                        str(record.get(field) or "")
                        for field in (
                            "title", "document_type", "section", "court",
                            "case_number", "neutral_citation", "jurisdiction", "text",
                        )
                    )
                    record["tokens"] = _tokens(searchable)
                    record["normalized_searchable"] = " ".join(
                        TOKEN.findall(searchable.casefold())
                    )
                    self._record_positions[record["id"]] = len(self.records)
                    self.records.append(record)

    @staticmethod
    def _valid_record(record: dict) -> bool:
        return all(
            isinstance(record.get(field), str) and record[field].strip()
            for field in ("id", "document_id", "title", "source_url", "text")
        )

    def stats(self) -> dict:
        return {
            "index": str(self.index_path),
            "approved_records": self.approved_records,
            "active_records": len(self.records),
            "pending_records": self.pending_records,
            "rejected_records": self.rejected_records,
            "invalid_records": self.invalid_records,
            "ready": bool(self.records),
            "mode": "pending_test" if self.allow_pending else "approved",
        }

    def search(self, query: str, limit: int = 3) -> list[dict]:
        query_tokens = _tokens(query)
        if not query_tokens:
            return []
        ordered_query_tokens = [
            token for token in TOKEN.findall(query.casefold()) if token not in STOP
        ]
        query_phrases = {
            " ".join(ordered_query_tokens[index:index + 2])
            for index in range(len(ordered_query_tokens) - 1)
        }
        concept_phrases = {
            phrase for phrase in query_phrases
            if all(
                token.isalpha()
                and token not in {"act", "article", "cgst", "section"}
                for token in phrase.split()
            )
        }
        normalized_query = " ".join(TOKEN.findall(query.casefold()))
        references = REFERENCE.findall(query)
        requested_references = set()
        requested_subsections = set()
        for kind, number in references:
            normalized_number = number.casefold()
            requested_references.add(f"{kind.casefold()} {normalized_number}")
            base_number = normalized_number.split("(", 1)[0]
            requested_references.add(f"{kind.casefold()} {base_number}")
            requested_subsections.update(re.findall(r"\((\d+[a-z]?)\)", normalized_number))
        query_words = set(re.findall(r"[a-z]+", query.casefold()))
        requested_titles = {
            title for alias, title in DOCUMENT_ALIASES.items() if alias in query_words
        }
        ranked = []
        for record in self.records:
            title = record["title"].casefold()
            # When the user names an Act by a known acronym, never mix in a
            # same-numbered provision from another Act. If that document is
            # absent, returning no result is safer than citing an unrelated law.
            if requested_titles and not any(
                requested_title in title for requested_title in requested_titles
            ):
                continue
            overlap = query_tokens.keys() & record["tokens"].keys()
            if not overlap:
                continue
            score = sum((1 + query_tokens[token]) * min(record["tokens"][token], 4) for token in overlap)
            score += 120 * sum(
                phrase in record["normalized_searchable"] for phrase in query_phrases
            )
            raw_text = str(record.get("text") or "").casefold()
            # A clause reference such as section 2(6), together with a named
            # concept, is much stronger evidence than repeated mentions of the
            # same concept elsewhere in the Act.
            if any(
                re.search(
                    rf"\({re.escape(subsection)}\).{{0,180}}"
                    + re.escape(phrase).replace(r"\ ", r"\s+"),
                    raw_text,
                    re.DOTALL,
                )
                for subsection in requested_subsections
                for phrase in concept_phrases
            ):
                score += 1000
            section = str(record.get("section") or "").casefold()
            score += sum(8 for token in query_tokens if token in title)
            score += sum(6 for token in query_tokens if token in section)
            # A user may name an Act in full while several Acts contain the same
            # section number. Prefer excerpts from the named document before
            # applying the generic exact-section boost.
            normalized_title = " ".join(TOKEN.findall(title))
            title_without_article = re.sub(r"^the\s+", "", normalized_title)
            if normalized_title in normalized_query or title_without_article in normalized_query:
                score += 500
            if section in requested_references:
                score += 200
            if requested_titles:
                score += 400
            ranked.append((score, record))
        ranked.sort(key=lambda item: item[0], reverse=True)
        return [record for score, record in ranked[:limit] if score >= 5]

    def context(self, query: str, max_chars: int = 5000) -> str:
        selections = []
        used = 0
        ranked = self.search(query)
        context_records = []
        seen = set()

        def add(record: dict) -> None:
            if record["id"] not in seen:
                seen.add(record["id"])
                context_records.append(record)

        if ranked:
            add(ranked[0])
            # Uploaded PDFs are split into sequential generic parts. Include
            # the next two parts so a section spanning a page/chunk boundary
            # is not cut off after its opening paragraph.
            if str(ranked[0].get("section") or "").casefold().startswith("document · part"):
                position = self._record_positions[ranked[0]["id"]]
                for offset in (1, 2):
                    adjacent_position = position + offset
                    if adjacent_position >= len(self.records):
                        break
                    adjacent = self.records[adjacent_position]
                    if adjacent.get("document_id") != ranked[0].get("document_id"):
                        break
                    add(adjacent)
            for record in ranked[1:]:
                add(record)

        for record in context_records:
            block = (
                f"SOURCE: {record['title']}\n"
                f"AUTHORITY: {record.get('source_publisher', 'Not specified')}\n"
                f"DOCUMENT ID: {record['document_id']}\n"
                f"SECTION: {record.get('section') or 'Not specified'}\n"
                f"PAGES: {record.get('page_start') or 'Not specified'}"
                f"-{record.get('page_end') or record.get('page_start') or 'Not specified'}\n"
                f"URL: {record['source_url']}\n"
                f"EXCERPT:\n{record['text']}"
            )
            if used + len(block) > max_chars:
                block = block[: max_chars - used]
            selections.append(block)
            used += len(block)
            if used >= max_chars:
                break
        return "\n\n---\n\n".join(selections)


# Kept as an import alias for older local code.
TaxCorpus = ApprovedCorpus

