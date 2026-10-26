#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="${1:-$DEPLOY_DIR/.env.production}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production environment file: $ENV_FILE" >&2
  echo "Copy deploy/.env.production.example to deploy/.env.production and replace every placeholder." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Engine with the Compose plugin is required." >&2
  exit 1
fi

if grep -Eq 'example\.com|replace-with-' "$ENV_FILE"; then
  echo "Replace all example domains and secret placeholders in $ENV_FILE before deployment." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required=(DOMAIN ADMIN_DOMAIN TLS_EMAIL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD OTP_SECRET ADMIN_INTERNAL_API_KEY ADMIN_SETTINGS_SECRET ADMIN_INITIAL_EMAIL ADMIN_INITIAL_PASSWORD)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "$key is required in $ENV_FILE" >&2
    exit 1
  fi
done

mkdir -p "$PROJECT_DIR/storage/admin" "$PROJECT_DIR/knowledge/admin/raw"
chmod 700 "$PROJECT_DIR/storage" "$PROJECT_DIR/storage/admin"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

echo "Starting PostgreSQL and Ollama..."
"${compose[@]}" up -d postgres ollama

echo "Waiting for PostgreSQL..."
for _ in {1..40}; do
  if "${compose[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
"${compose[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null

echo "Applying the idempotent database schema..."
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$PROJECT_DIR/landing-page/database/schema.sql"

echo "Preparing the CoVakeel Ollama model (the first download can take several minutes)..."
"${compose[@]}" --profile tools run --rm ollama-init

echo "Building and starting CoVakeel..."
"${compose[@]}" up -d --build ai landing admin caddy

echo "Deployment started. Check status with:"
echo "docker compose --env-file $ENV_FILE -f $COMPOSE_FILE ps"
echo "User app:  https://$DOMAIN"
echo "Admin app: https://$ADMIN_DOMAIN"

