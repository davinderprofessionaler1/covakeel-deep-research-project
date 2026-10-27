"""Strict retrieval over human-approved CoVakeel knowledge records."""

from collections import Counter
import json
from pathlib import Path
import re


TOKEN = re.compile(r"[a-zA-Z0-9]{2,}")
REFERENCE = re.compile(
    r"\b(article|section|rule)\s+(\d+[a-z]?(?:\(\d+[a-z]?\))*)",
    re.IGNORECASE,
)
FORM_REFERENCE = re.compile(
    r"\b(?:form\s+)?(?:gst\s+)?"
    r"(cmp|reg|itc|enr|gstr|pct|pmt|rfd|asmt|apl|rvn|aar|ara|ins|drc|cpd)"
    r"[\s-]*(\d+[a-z]?)\b",
    re.IGNORECASE,
)
DOCUMENT_ALIASES = {
    "bns": "bharatiya nyaya sanhita",
    "bnss": "bharatiya nagarik suraksha sanhita",
    "bsa": "bharatiya sakshya adhiniyam",
    "cgst": "central goods and services tax",
    "cgst act": "central goods and services tax act, 2017",
    "cgst act 2017": "central goods and services tax act, 2017",
    "central goods and services tax act": "central goods and services tax act, 2017",
    "central goods and services tax act 2017": "central goods and services tax act, 2017",
    "cgst rule": "central goods and services tax (cgst) rules",
    "cgst rules": "central goods and services tax (cgst) rules",
    "cgst form": "part b (forms)",
    "cgst forms": "part b (forms)",
    "cgst amendment": "tax (amendment)",
    "cgst amendment act 2018": "tax (amendment) act, 2018",
    "cgst amendment act 2023": "tax (amendment) act, 2023",
    "central goods and services tax amendment": "tax (amendment)",
    "central goods and services tax amendment act 2018": "tax (amendment) act, 2018",
    "central goods and services tax amendment act 2023": "tax (amendment) act, 2023",
    "central goods and services tax rules": "central goods and services tax (cgst) rules",
    "extension to jammu and kashmir": "extension to jammu and kashmir",
    "finance act 2019": "finance act, 2019",
    "finance act 2020": "finance act, 2020",
    "finance act 2021": "finance act, 2021",
    "finance act 2022": "finance act, 2022",
    "finance act 2023": "finance act, 2023",
    "101st amendment": "one hundred and first amendment",
    "101st constitution amendment": "one hundred and first amendment",
    "constitution 101st amendment": "one hundred and first amendment",
    "constitution amendment act 2016": "one hundred and first amendment",
    "one hundred and first amendment": "one hundred and first amendment",
}
CONTENT_ALIASES = {
    "cgst": "central goods and services tax",
    "igst": "integrated goods and services tax",
    "pmla": "prevention of money laundering",
    "utgst": "union territory goods and services tax",
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
        requested_forms = {
            (family.casefold(), number.casefold())
            for family, number in FORM_REFERENCE.findall(query)
        }
        requested_references = set()
        requested_subsections = set()
        requested_textual_references = set()
        for kind, number in references:
            normalized_number = number.casefold()
            requested_references.add(f"{kind.casefold()} {normalized_number}")
            base_number = normalized_number.split("(", 1)[0]
            requested_references.add(f"{kind.casefold()} {base_number}")
            requested_textual_references.add((kind.casefold(), base_number))
            requested_subsections.update(re.findall(r"\((\d+[a-z]?)\)", normalized_number))
        query_words = set(re.findall(r"[a-z]+", query.casefold()))
        requested_content_titles = {
            title for alias, title in CONTENT_ALIASES.items()
            if alias in query_words
        }
        matched_aliases = [
            (alias, title) for alias, title in DOCUMENT_ALIASES.items()
            if (alias in normalized_query if " " in alias else alias in query_words)
        ]
        phrase_aliases = [item for item in matched_aliases if " " in item[0]]
        if phrase_aliases:
            longest_alias = max(len(alias.split()) for alias, _title in phrase_aliases)
            phrase_aliases = [
                item for item in phrase_aliases
                if len(item[0].split()) == longest_alias
            ]
        requested_titles = {
            title for _alias, title in (phrase_aliases or matched_aliases)
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
            if requested_content_titles and not any(
                content_title in record["normalized_searchable"]
                for content_title in requested_content_titles
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
            if requested_forms and "part b (forms)" in title:
                score += 1600
            score += 1400 * sum(
                f"{family} {number}" in record["normalized_searchable"]
                for family, number in requested_forms
            )
            score += 3000 * sum(
                bool(re.search(
                    rf"(?:^|\n\n)form[\s-]+(?:gst[\s-]+)?"
                    rf"{re.escape(family)}[\s\-–—]*{re.escape(number)}\b",
                    raw_text,
                ))
                for family, number in requested_forms
            )
            score += 5000 * sum(
                bool(re.search(
                    rf"form[\s-]+(?:gst[\s-]+)?"
                    rf"{re.escape(family)}[\s\-–—]*{re.escape(number)}"
                    rf"[0-9]*\s*\[\s*see\b",
                    raw_text,
                ))
                for family, number in requested_forms
            )
            score += 900 * sum(
                content_title in record["normalized_searchable"]
                for content_title in requested_content_titles
            )
            if any(
                re.search(
                    rf"(?:^|\s)\d+[a-z]?\.\s+in\s+{re.escape(kind)}\s+{re.escape(number)}\b",
                    raw_text,
                )
                for kind, number in requested_textual_references
            ):
                score += 700
            if any(
                kind in {"article", "section", "rule"}
                and re.search(
                    rf"(?:^|\n\n|(?<=\s))[‘’\"'“”\[]*{re.escape(number)}\.\s+",
                    raw_text,
                )
                for kind, number in requested_textual_references
            ):
                score += 3000
            # For a generic constitutional Article question, prefer the
            # consolidated Constitution over an amending Act. The consolidated
            # copy contains the provision as currently arranged and avoids the
            # Gazette's interleaved marginal headings. A user who explicitly
            # names the 101st Amendment is already constrained by
            # ``requested_titles`` above and still receives that Act.
            if (
                not requested_titles
                and "the constitution of india" in title
                and any(kind == "article" for kind, _number in requested_textual_references)
                and any(
                    re.search(
                        rf"(?:^|\n\n|(?<=\s))[‘’\"'“”\[]*{re.escape(number)}\.\s+",
                        raw_text,
                    )
                    for kind, number in requested_textual_references
                    if kind == "article"
                )
            ):
                score += 20000
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
        requested_articles = {
            number.split("(", 1)[0]
            for kind, number in requested_textual_references
            if kind == "article"
        }
        if requested_articles and not requested_titles:
            exact_articles = []
            for score, record in ranked:
                title = record["title"].casefold()
                section = str(record.get("section") or "").casefold()
                raw_text = str(record.get("text") or "").casefold()
                if any(
                    section == f"article {number}"
                    or (
                        "constitution of india" in title
                        and re.search(
                            rf"(?:^|\n\n|(?<=\s))[‘’\"'“”\[]*"
                            rf"{re.escape(number)}\.\s+",
                            raw_text,
                        )
                    )
                    for number in requested_articles
                ):
                    exact_articles.append((score, record))
            if not exact_articles:
                return []
            ranked = exact_articles
        return [record for score, record in ranked[:limit] if score >= 5]

    def context(self, query: str, max_chars: int = 5000) -> str:
        selections = []
        used = 0
        ranked = self.search(query)
        context_records = []
        seen = set()
        focused_excerpt = None

        def add(record: dict) -> None:
            if record["id"] not in seen:
                seen.add(record["id"])
                context_records.append(record)

        if ranked:
            add(ranked[0])
            focused_excerpt = self._focused_reference_excerpt(ranked[0], query)
            # Uploaded PDFs are split into sequential generic parts. Include
            # the next two parts so a section spanning a page/chunk boundary
            # is not cut off after its opening paragraph.
            if (
                focused_excerpt is None
                and " · part " in str(ranked[0].get("section") or "").casefold()
            ):
                position = self._record_positions[ranked[0]["id"]]
                for offset in (1, 2):
                    adjacent_position = position + offset
                    if adjacent_position >= len(self.records):
                        break
                    adjacent = self.records[adjacent_position]
                    if adjacent.get("document_id") != ranked[0].get("document_id"):
                        break
                    add(adjacent)
            if focused_excerpt is None:
                for record in ranked[1:]:
                    add(record)

        for record in context_records:
            excerpt = (
                focused_excerpt
                if record is context_records[0] and focused_excerpt is not None
                else record["text"]
            )
            block = (
                f"SOURCE: {record['title']}\n"
                f"AUTHORITY: {record.get('source_publisher', 'Not specified')}\n"
                f"DOCUMENT ID: {record['document_id']}\n"
                f"SECTION: {record.get('section') or 'Not specified'}\n"
                f"PAGES: {record.get('page_start') or 'Not specified'}"
                f"-{record.get('page_end') or record.get('page_start') or 'Not specified'}\n"
                f"URL: {record['source_url']}\n"
                f"EXCERPT:\n{excerpt}"
            )
            if used + len(block) > max_chars:
                block = block[: max_chars - used]
            selections.append(block)
            used += len(block)
            if used >= max_chars:
                break
        return "\n\n---\n\n".join(selections)

    def exact_reference_text(
        self,
        query: str,
        max_chars: int = 2600,
    ) -> tuple[str, str] | None:
        """Return a short, specifically requested provision verbatim.

        Exact text is safer than abstractive summarisation for compact Articles
        and numbered definition clauses because every actor, qualifier and
        negative clause remains intact. Longer provisions continue through the
        model so the response does not become an unbounded document dump.
        """
        references = REFERENCE.findall(query)
        if len(references) != 1:
            return None
        kind, number = references[0]
        kind = kind.casefold()
        if kind not in {"article", "section", "rule"}:
            return None
        if kind != "article" and "(" not in number:
            return None
        ranked = self.search(query)
        if not ranked:
            return None
        record = ranked[0]
        if kind == "article":
            if "constitution" not in record["title"].casefold():
                return None
            exact_section = f"article {number.casefold()}"
            exact_record = next(
                (
                    candidate
                    for candidate in self.records
                    if str(candidate.get("section") or "").casefold() == exact_section
                    and "constitution" in candidate["title"].casefold()
                ),
                None,
            )
            if exact_record is not None:
                record = exact_record
            elif "constitution of india" not in record["title"].casefold():
                return None
        excerpt = self._focused_reference_excerpt(record, query)
        if not excerpt:
            return None
        # Repair PDF line wrapping without changing the provision's wording.
        text = re.sub(r"-\s*\n\s*", "-", excerpt)
        text = re.sub(r"\s+", " ", text).strip()
        text = text.removeprefix("[").removesuffix("]").strip()
        if not text or len(text) > max_chars:
            return None
        return f"{kind.title()} {number.upper()}", text

    def exact_article_text(
        self,
        query: str,
        max_chars: int = 2600,
    ) -> tuple[str, str] | None:
        """Backward-compatible wrapper for callers expecting Article text."""
        match = REFERENCE.findall(query)
        if len(match) != 1 or match[0][0].casefold() != "article":
            return None
        return self.exact_reference_text(query, max_chars=max_chars)

    def _focused_reference_excerpt(self, record: dict, query: str) -> str | None:
        """Return one requested provision without neighbouring-law spillover."""
        references = REFERENCE.findall(query)
        if len(references) != 1:
            return None
        kind, number = references[0]
        base_number = number.casefold().split("(", 1)[0]
        requested_subsections = re.findall(r"\((\d+[a-z]?)\)", number.casefold())
        if kind.casefold() not in {"article", "section", "rule"}:
            return None

        def focus_requested_subsection(value: str) -> str:
            if not requested_subsections:
                return value
            target = requested_subsections[-1]
            start = re.search(rf"\({re.escape(target)}\)", value, re.IGNORECASE)
            if start is None:
                return value
            following = re.search(r"\(\d+[a-z]?\)", value[start.end():], re.IGNORECASE)
            end = start.end() + following.start() if following else len(value)
            return value[start.start():end].strip()

        heading = re.compile(
            rf"(?:^|\n\n|(?<=\s))[‘’\"'“”\[]*{re.escape(base_number)}\.\s+",
            re.IGNORECASE,
        )
        current_text = str(record.get("text") or "")
        match = heading.search(current_text)
        if match is None:
            return None

        position = self._record_positions[record["id"]]
        document_id = record.get("document_id")
        section_label = str(record.get("section") or "").strip()

        def clean_constitution_page(value: str) -> str:
            value = re.sub(
                r"^\s*\d+\s+THE CONSTITUTION OF INDIA\s*\n"
                r"\s*\(Part[^\n]*\)\s*\n",
                "",
                value,
                flags=re.IGNORECASE,
            )
            # Official consolidated pages place amendment footnotes after a
            # long underscore rule. They are authority notes, not provision
            # text, and small models can mistake their numbers for clauses.
            value = re.split(r"\n_{20,}\s*\n", value, maxsplit=1)[0]
            return value.strip()

        structured_article = (
            kind.casefold() == "article"
            and re.fullmatch(r"article\s+\d+[a-z]?", section_label, re.IGNORECASE)
        )
        first_part = current_text[match.start():]
        parts = [clean_constitution_page(first_part) if structured_article else first_part]
        for adjacent in self.records[position + 1:]:
            if adjacent.get("document_id") != document_id:
                break
            if structured_article:
                if str(adjacent.get("section") or "").strip() != section_label:
                    break
                parts.append(clean_constitution_page(str(adjacent.get("text") or "")))
            else:
                parts.append(str(adjacent.get("text") or ""))
        combined = "\n\n".join(parts)

        if structured_article:
            article_heading = re.compile(
                r"(?:^|\n\n|(?<=\s))[‘’\"'“”\[]*(\d{1,3}[a-z]?)\.\s+",
                re.IGNORECASE,
            )
            found_requested = False
            for candidate in article_heading.finditer(combined):
                if candidate.group(1).casefold() == base_number:
                    found_requested = True
                    continue
                if found_requested:
                    combined = combined[:candidate.start()]
                    break
            combined = re.sub(r"\n\s*\d+\s*$", "", combined)
            excerpt = focus_requested_subsection(combined.strip())
            return excerpt or None

        next_heading = re.compile(
            r"(?:^|\n\n|(?<=\s))[‘’\"'“”\[]*(\d{1,3}[a-z]?)\.\s+",
            re.IGNORECASE,
        )
        for candidate in next_heading.finditer(combined, match.end() - match.start()):
            if candidate.group(1).casefold() != base_number:
                combined = combined[:candidate.start()]
                break
        excerpt = focus_requested_subsection(combined.strip())
        return excerpt or None


# Kept as an import alias for older local code.
TaxCorpus = ApprovedCorpus

