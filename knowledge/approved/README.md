# Approved CoVakeel knowledge base

CoVakeel reads only `chunks.jsonl` in this directory. Every usable record must
match `schema.json` and contain `"verification_status":"approved"`. Pending,
rejected, malformed, and legacy records are excluded at runtime.

The uploaded `indian_legal_rag_starter.zip` contains ingestion/indexing code but
no PDFs and no JSONL records. Its SHA-256 is
`e36c7afe0499c6c35c35ab60817ef6f13ad80a4bc33c8c91e0cffe028cc6d5a4`.

## Loading reviewed data

1. Use the starter `ingest.py` with explicit permitted HTTPS PDF URLs. It writes
   pending JSONL records.
2. A qualified client legal reviewer checks the source, extraction, sections,
   dates, amendments, and each record's text.
3. The reviewer changes accepted records to `verification_status=approved`.
4. Replace the active index with the reviewed files:

   ```bash
   python3 scripts/import_approved_records.py /path/to/reviewed-1.jsonl /path/to/reviewed-2.jsonl
   ```

5. Restart CoVakeel. `/api/health` reports the number of approved records.

Until approved records are loaded, every supported legal question receives the
fixed knowledge-base-unavailable response without calling the language model.
