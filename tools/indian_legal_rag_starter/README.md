# Indian Legal RAG starter ingestion kit

This package was supplied for the CoVakeel ingestion workflow. It accepts an
explicit permitted HTTPS PDF URL, stores the original file, and creates pending
page-based JSONL chunks. Pending output must be reviewed before it can be
imported into CoVakeel.

```bash
cd tools/indian_legal_rag_starter
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python ingest.py --url 'https://OFFICIAL-DOMAIN/FILE.pdf' \
  --title 'Exact document title' --type act --jurisdiction India \
  --publisher 'Official publishing authority'
```

Review source identity, OCR quality, section boundaries, completeness,
effective dates, repeals, and amendments. Set only accepted records to
`verification_status=approved`, then import the reviewed JSONL from the project
root:

```bash
python3 scripts/import_approved_records.py tools/indian_legal_rag_starter/output/FILE.jsonl
```

The Qdrant example is retained for a future larger corpus. The current local
prototype uses its dependency-free approved-record lexical index.
