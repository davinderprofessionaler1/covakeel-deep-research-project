"""Fast legal-scope gate for the local prototype."""

import re


REFUSAL_MESSAGE = (
    "CoVakeel is a legal research assistant. I can only help with legal, "
    "regulatory, tax and compliance-related questions."
)

LEGAL_TERMS = {
    "act", "advocate", "appeal", "assessment", "bail", "case", "cess",
    "citation", "civil", "compliance", "constitution", "contract", "court",
    "criminal", "customs", "deduction", "demand", "dispute", "dtaa", "duty",
    "evidence", "exemption", "gst", "igst", "cgst", "utgst", "income tax",
    "input tax credit", "invoice", "itc", "itr", "judgment", "jurisdiction",
    "law", "lawyer", "legal", "litigation", "notice", "offence", "penalty",
    "prosecution", "refund", "regulation", "return filing", "rule", "section",
    "statute", "tax", "taxation", "tds", "tcs", "tribunal", "vakeel",
    "writ", "ਕਾਨੂੰਨ", "ਕੋਰਟ", "ਟੈਕਸ", "ਵਕੀਲ", "कानून", "अदालत", "टैक्स",
}

LEGAL_PATTERNS = (
    re.compile(r"\b(section|sec\.?|rule|article)\s*\d+[a-z]*\b", re.I),
    re.compile(r"\b(assessment|financial|tax)\s+year\b", re.I),
    re.compile(r"\b[A-Z][A-Za-z-]+\s+(Act|Rules),?\s+\d{4}\b"),
)


def is_legal_query(value: str) -> bool:
    normalized = " ".join(value.casefold().split())
    if any(term in normalized for term in LEGAL_TERMS):
        return True
    return any(pattern.search(value) for pattern in LEGAL_PATTERNS)

