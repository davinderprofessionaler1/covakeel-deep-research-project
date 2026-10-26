#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLED_NODE_DIR="/home/ubuntu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
BUNDLED_PNPM="/home/ubuntu/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"

if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  PNPM_COMMAND="$(command -v pnpm)"
elif [[ -x "$BUNDLED_NODE_DIR/node" && -x "$BUNDLED_PNPM" ]]; then
  export PATH="$BUNDLED_NODE_DIR:$PATH"
  PNPM_COMMAND="$BUNDLED_PNPM"
else
  echo "Node.js 20+ and pnpm are required." >&2
  exit 1
fi

cd "$PROJECT_DIR"
exec "$PNPM_COMMAND" start
