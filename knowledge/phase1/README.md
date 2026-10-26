# CoVakeel Phase 1 legal corpus

This folder contains review material for these four sources only:

1. The Constitution of India
2. The Bharatiya Nyaya Sanhita, 2023 (BNS)
3. The Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS)
4. The Bharatiya Sakshya Adhiniyam, 2023 (BSA)

`raw/` stores immutable, hash-named copies of the official PDFs. `pending/`
stores automated page extraction with candidate Article/Section labels. The
labels, text, dates, amendments, commencement provisions, footnotes and
schedules must be checked by a qualified Indian legal reviewer.

Nothing here is active in the chatbot. The chatbot reads only
`knowledge/approved/chunks.jsonl`, and the Phase 1 generator never modifies
that file.

## Build or refresh

```bash
python3 tools/covakeel_phase1/build_phase1.py
```

After each source record is checked, copy it to a separate reviewed JSONL and
change its status to `approved`. Keep rejected records in the review evidence,
but do not import them. Validate and replace the runtime index only after legal
sign-off:

```bash
python3 scripts/import_approved_records.py /path/to/legal-review-approved.jsonl
```

Questions and expected answers should be maintained as an evaluation set. They
test retrieval and answer quality; they do not by themselves approve source
law or fine-tune the model.
