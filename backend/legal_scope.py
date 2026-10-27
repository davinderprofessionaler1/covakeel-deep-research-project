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

CONTEXTUAL_FOLLOWUP_PATTERNS = (
    re.compile(r"\b(convert|create|download|export|make|save)\b.{0,36}\bpdf\b", re.I),
    re.compile(r"\b(change|translate|rewrite)\b.{0,36}\b(language|english|hindi|punjabi|marathi|tamil|bengali|urdu)\b", re.I),
    re.compile(r"\b(in|into)\s+(english|hindi|punjabi|marathi|tamil|bengali|urdu)\b", re.I),
    re.compile(r"\b(explain|summari[sz]e|simplify|shorten|elaborate|rephrase|continue)\b", re.I),
    re.compile(r"\b(this|that|it|above|previous)\s+(answer|response|information|text|content)\b", re.I),
)

LANGUAGE_NAMES = ("English", "Hindi", "Punjabi", "Marathi", "Tamil", "Bengali", "Urdu")


def is_legal_query(value: str) -> bool:
    normalized = " ".join(value.casefold().split())
    if any(term in normalized for term in LEGAL_TERMS):
        return True
    return any(pattern.search(value) for pattern in LEGAL_PATTERNS)


def is_contextual_followup(value: str) -> bool:
    """Return whether a short command can sensibly modify a prior legal answer."""

    return any(pattern.search(value) for pattern in CONTEXTUAL_FOLLOWUP_PATTERNS)


def previous_legal_query(messages) -> str | None:
    """Find the most recent legal user question before the current message."""

    for message in reversed(messages[:-1]):
        if message.role == "user" and is_legal_query(message.content):
            return message.content
    return None


def is_legal_conversation(messages) -> bool:
    """Allow a legal question or a supported follow-up to prior legal context."""

    if not messages:
        return False
    latest = messages[-1].content
    return is_legal_query(latest) or bool(
        is_contextual_followup(latest) and previous_legal_query(messages)
    )


def contextual_followup_response(messages) -> str | None:
    """Handle capability/clarification follow-ups without a misleading refusal."""

    if not messages or not previous_legal_query(messages):
        return None
    latest = " ".join(messages[-1].content.split())
    if re.search(r"\b(convert|create|download|export|make|save)\b.{0,36}\bpdf\b", latest, re.I):
        return (
            "I can format the previous legal answer as clean, PDF-ready content, "
            "but downloadable PDF export is not available yet. You can copy the formatted "
            "answer into Word or Google Docs and export it as a PDF."
        )
    if re.search(r"\b(change|translate|rewrite)\b.{0,36}\blanguage\b", latest, re.I):
        if not any(re.search(rf"\b{language}\b", latest, re.I) for language in LANGUAGE_NAMES):
            return (
                "Which language would you like the previous legal answer translated into—"
                "for example, Hindi, Punjabi, Marathi, Tamil, Bengali, Urdu or English?"
            )
    return None

