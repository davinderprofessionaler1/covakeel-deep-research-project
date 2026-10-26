#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OLLAMA_BIN="${OLLAMA_BIN:-/home/ubuntu/Public/covakeel/.local/ollama/bin/ollama}"
OLLAMA_MODELS_DIR="${OLLAMA_MODELS:-/home/ubuntu/Public/covakeel/.local/ollama-models}"
RUNTIME_DIR="$PROJECT_DIR/.runtime"

mkdir -p "$RUNTIME_DIR"

if [[ ! -x "$OLLAMA_BIN" ]]; then
  echo "Ollama was not found at: $OLLAMA_BIN" >&2
  echo "Install Ollama or set OLLAMA_BIN to its executable path." >&2
  exit 1
fi

if ! python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=1)" >/dev/null 2>&1; then
  echo "Starting Ollama…"
  OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS="$OLLAMA_MODELS_DIR" \
    "$OLLAMA_BIN" serve >"$RUNTIME_DIR/ollama.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/ollama.pid"

  for _ in {1..30}; do
    if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=1)" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

cd "$PROJECT_DIR"
exec python3 -m backend.server

