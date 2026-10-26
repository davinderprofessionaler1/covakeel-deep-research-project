import unittest

from tools.covakeel_phase1.build_phase1 import section_segments, validate_official_url


class Phase1GeneratorTests(unittest.TestCase):
    def test_accepts_pinned_official_hosts(self):
        validate_official_url("https://www.legislative.gov.in/example.pdf")
        validate_official_url("https://delhipolice.mha.gov.in/example.pdf")
        validate_official_url("https://cdnbbsr.s3waas.gov.in/example.pdf")

    def test_rejects_lookalike_and_http_hosts(self):
        with self.assertRaises(ValueError):
            validate_official_url("https://legislative.gov.in.example.com/file.pdf")
        with self.assertRaises(ValueError):
            validate_official_url("http://www.legislative.gov.in/file.pdf")

    def test_section_candidate_ignores_footnotes(self):
        text = "1. (1) This Act may be called the Example Act.\n\n1. Subs. by Act 2 of 2024."
        segments, current = section_segments(text, None, "Section")
        self.assertEqual(current, "Section 1")
        self.assertEqual(len(segments), 1)

    def test_detects_number_after_gazette_marginal_heading(self):
        text = "Definitions.         2. In this Act, unless the context otherwise requires,—"
        segments, current = section_segments(text, "Section 1", "Section")
        self.assertEqual(current, "Section 2")
        self.assertEqual(segments[0][0], "Section 2")

    def test_detects_section_after_numbered_marginal_citation(self):
        text = "1 of 1872.         170. (1) The earlier Act is hereby repealed."
        segments, current = section_segments(text, "Section 169", "Section", 170)
        self.assertEqual(current, "Section 170")
        self.assertEqual(segments[0][0], "Section 170")

    def test_rejects_candidate_above_document_maximum(self):
        segments, current = section_segments("678. A schedule entry.", "Article 395", "Article", 395)
        self.assertEqual(current, "Article 395")
        self.assertEqual(segments[0][0], "Article 395")

    def test_next_heading_does_not_capture_previous_line(self):
        text = (
            "14. Equality before law.—The laws apply within the territory of\n"
            "India.\n"
            "        15. Prohibition of discrimination.—The State shall not discriminate."
        )
        segments, current = section_segments(text, None, "Article", 395)
        self.assertEqual(current, "Article 15")
        self.assertTrue(segments[0][1].endswith("India."))
        self.assertTrue(segments[1][1].startswith("15."))


if __name__ == "__main__":
    unittest.main()
