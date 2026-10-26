# CoVakeel Local AI

Local-first CoVakeel prototype with a responsive browser interface, a small Python API, and private Ollama inference. It is intentionally dependency-free so it can run on the current development laptop without PHP, Composer, Node.js, or Docker.

The repository also contains the separate `landing-page/` user application and `admin/` administration application. Each has its own React frontend and Node.js API. Shared branding and encrypted SMTP configuration are stored under the ignored `storage/admin/` directory.

## Architecture

```text
Phone / laptop / PC browser
            |
            v
CoVakeel local HTTP service (port 8080)
            |
            v
Ollama on localhost (port 11434)
            |
            v
CoVakeel local model profile (Qwen3 1.7B base)
```

Ollama is never exposed to other devices. Other devices talk only to the CoVakeel service. The provider layer keeps the model integration separate so a cloud provider can replace Ollama when the product goes live.

## Start locally

```bash
cd /home/ubuntu/Documents/ChatGPT/covakeel6.1
bash scripts/start-local.sh
```

Open `http://127.0.0.1:8080` on this computer. The terminal also prints a same-Wi-Fi URL for phones and PCs.

The startup script uses the `covakeel-local:latest` profile. Create it once from the included model definition:

```bash
OLLAMA_MODELS=/home/ubuntu/Public/covakeel/.local/ollama-models \
  /home/ubuntu/Public/covakeel/.local/ollama/bin/ollama create covakeel-local \
  -f models/CoVakeel.Modelfile
```

This profile uses the lighter Qwen3 1.7B weights and disables its forced thinking mode, which materially improves interactive latency on the current CPU.

If needed, create `.env` from `.env.example` and change the local model or limits:

```bash
cp .env.example .env
```

## Same-Wi-Fi devices

Keep the laptop and the other device on the same trusted Wi-Fi. Open the `Same Wi-Fi` address printed by the start command. The default server bind is `0.0.0.0`; do not forward port 8080 to the public internet.

## Tests

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile backend/*.py backend/providers/*.py
```

## Approved-data-only legal RAG

The API rejects clearly non-legal questions before invoking the model. For a
legal question, it searches only `knowledge/approved/chunks.jsonl`. Records are
loaded only when `verification_status` is `approved`. If no approved excerpt
supports the question, CoVakeel returns a fixed unavailable response without
calling Ollama.

The uploaded `indian_legal_rag_starter.zip` is an ingestion starter and contains
no legal documents or approved records. Follow `knowledge/approved/README.md`
to review its pending output and import approved JSONL records. The runtime does
not use the older downloaded tax corpus while strict mode is active.

The previous allow-listed tax research material remains under `knowledge/tax/`
for audit and development reference. It is not part of the approved runtime
index. To replace the active index after legal review, run:

```bash
python3 scripts/import_approved_records.py /path/to/reviewed-records.jsonl
```

### Phase 1: Constitution and new criminal laws

The pinned Phase 1 source manifest and hardened generator are under
`tools/covakeel_phase1/`. They download the Constitution, BNS, BNSS and BSA
from official government hosts, verify the final download host and PDF type,
archive each PDF by SHA-256, and create traceable `pending` records under
`knowledge/phase1/`. Candidate Article/Section labels are extraction aids and
still require legal review.

```bash
python3 tools/covakeel_phase1/build_phase1.py
```

This command cannot approve records and never changes the active runtime index.

## Production migration

The web UI calls only CoVakeel's `/api/chat/stream` endpoint. A production provider can therefore be added behind the same endpoint without changing the web or future Flutter clients. Production still requires authentication, tenant isolation, database storage, verified Indian legal RAG, citation verification, HTTPS, queues, monitoring, and formal acceptance tests.

