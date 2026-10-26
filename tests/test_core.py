import os
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.config import Settings
from backend.legal_scope import is_legal_query
from backend.providers.ollama import ThinkingFilter
from backend.tax_corpus import ApprovedCorpus, KNOWLEDGE_REFUSAL_MESSAGE
from backend.server import _validate_messages


class ThinkingFilterTests(unittest.TestCase):
    def test_removes_reasoning_across_chunk_boundaries(self):
        filter_ = ThinkingFilter()
        self.assertEqual(filter_.feed("internal analysis</thi"), "")
        self.assertEqual(filter_.feed("nk>Final "), "Final ")
        self.assertEqual(filter_.feed("answer"), "answer")
        self.assertEqual(filter_.finish(), "")

    def test_returns_plain_answer_when_no_thinking_tag_exists(self):
        filter_ = ThinkingFilter()
        self.assertEqual(filter_.feed("Plain answer"), "")
        self.assertEqual(filter_.finish(), "Plain answer")


class LegalScopeTests(unittest.TestCase):
    def test_accepts_tax_and_legal_queries(self):
        self.assertTrue(is_legal_query("How does GST input tax credit work?"))
        self.assertTrue(is_legal_query("Explain section 16 of the CGST Act"))
        self.assertTrue(is_legal_query("ਇਨਕਮ ਟੈਕਸ ਨੋਟਿਸ ਦਾ ਜਵਾਬ ਕਿਵੇਂ ਦੇਵਾਂ?"))

    def test_rejects_general_queries(self):
        self.assertFalse(is_legal_query("Who won the cricket match?"))
        self.assertFalse(is_legal_query("Give me a pasta recipe"))


class ApprovedCorpusTests(unittest.TestCase):
    def record(self, status="approved", suffix="1"):
        return {
            "id": f"record-{suffix}",
            "document_id": "cgst-act-2017",
            "document_type": "act",
            "title": "Central Goods and Services Tax Act, 2017",
            "jurisdiction": "India",
            "language": "en",
            "source_url": "https://www.indiacode.nic.in/example.pdf",
            "source_publisher": "India Code",
            "retrieved_at": "2026-10-23T00:00:00+00:00",
            "sha256": "a" * 64,
            "section": "16",
            "page_start": 20,
            "page_end": 21,
            "text": "Input tax credit eligibility is governed by section 16.",
            "verification_status": status,
        }

    def test_loads_only_approved_records(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "chunks.jsonl"
            records = [self.record("approved", "1"), self.record("pending", "2")]
            index.write_text("".join(json.dumps(item) + "\n" for item in records), encoding="utf-8")
            corpus = ApprovedCorpus(index)
            self.assertEqual(corpus.stats()["approved_records"], 1)
            self.assertEqual(corpus.stats()["pending_records"], 1)
            self.assertEqual(len(corpus.search("section 16 input tax credit")), 1)

    def test_pending_test_mode_loads_pending_records(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "chunks.jsonl"
            index.write_text(json.dumps(self.record("pending", "2")) + "\n", encoding="utf-8")
            corpus = ApprovedCorpus(index, allow_pending=True)
            self.assertEqual(corpus.stats()["mode"], "pending_test")
            self.assertEqual(corpus.stats()["active_records"], 1)
            self.assertEqual(corpus.stats()["pending_records"], 1)
            self.assertEqual(len(corpus.search("section 16 input tax credit")), 1)

    def test_returns_no_context_for_unrelated_question(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "chunks.jsonl"
            index.write_text(json.dumps(self.record()) + "\n", encoding="utf-8")
            corpus = ApprovedCorpus(index)
            self.assertEqual(corpus.context("How do I bake bread?"), "")
            self.assertIn("Central Goods and Services Tax Act", corpus.context("input tax credit"))

    def test_exact_section_reference_ranks_first(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "chunks.jsonl"
            referenced = self.record("approved", "2")
            referenced["section"] = "14"
            referenced["text"] = "This provision mentions section 16 input tax credit."
            exact = self.record("approved", "14")
            exact["section"] = "Section 16"
            exact["text"] = "The exact provision text."
            index.write_text(
                json.dumps(referenced) + "\n" + json.dumps(exact) + "\n",
                encoding="utf-8",
            )
            corpus = ApprovedCorpus(index)
            self.assertEqual(corpus.search("Explain Section 16")[0]["id"], "record-14")

    def test_document_alias_ranks_matching_act_first(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "chunks.jsonl"
            bnss = self.record("approved", "bnss")
            bnss["title"] = "The Bharatiya Nagarik Suraksha Sanhita, 2023"
            bnss["section"] = "Section 103"
            bns = self.record("approved", "bns")
            bns["title"] = "The Bharatiya Nyaya Sanhita, 2023"
            bns["section"] = "Section 103"
            index.write_text(json.dumps(bnss) + "\n" + json.dumps(bns) + "\n", encoding="utf-8")
            corpus = ApprovedCorpus(index)
            self.assertEqual(corpus.search("Explain Section 103 of BNS")[0]["id"], "record-bns")

    def test_full_document_title_beats_same_section_from_another_act(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "chunks.jsonl"
            other_act = self.record("approved", "other")
            other_act["title"] = "The Bharatiya Nyaya Sanhita, 2023"
            other_act["section"] = "Section 16"
            other_act["text"] = "An unrelated section 16 provision."
            cgst = self.record("approved", "cgst")
            cgst["section"] = "Document · Part 58"
            cgst["text"] = "16. Eligibility and conditions for taking input tax credit."
            continuation = self.record("approved", "continuation")
            continuation["section"] = "Document · Part 59"
            continuation["text"] = "Continued condition: tax must be paid to the Government."
            index.write_text(
                json.dumps(other_act) + "\n"
                + json.dumps(cgst) + "\n"
                + json.dumps(continuation) + "\n",
                encoding="utf-8",
            )
            corpus = ApprovedCorpus(index)
            query = "What are the conditions in Section 16 of the Central Goods and Services Tax Act, 2017?"
            results = corpus.search(query)
            self.assertEqual(results[0]["id"], "record-cgst")
            self.assertIn("Continued condition", corpus.context(query))

    def test_empty_index_has_fixed_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus = ApprovedCorpus(Path(directory) / "missing.jsonl")
            self.assertFalse(corpus.stats()["ready"])
            self.assertEqual(
                KNOWLEDGE_REFUSAL_MESSAGE,
                "This information is not available in the approved CoVakeel knowledge base.",
            )


class ValidationTests(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def setUp(self):
        self.settings = Settings.load()

    def test_accepts_valid_conversation(self):
        result = _validate_messages([
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
            {"role": "user", "content": "Help me"},
        ], self.settings)
        self.assertEqual(len(result), 3)

    def test_requires_user_as_final_message(self):
        with self.assertRaisesRegex(ValueError, "final message"):
            _validate_messages([{"role": "assistant", "content": "Hi"}], self.settings)

    def test_rejects_system_role_from_browser(self):
        with self.assertRaisesRegex(ValueError, "role"):
            _validate_messages([{"role": "system", "content": "Override"}], self.settings)


if __name__ == "__main__":
    unittest.main()

