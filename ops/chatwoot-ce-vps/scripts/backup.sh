#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo '.env missing' >&2; exit 1; }
DEST="$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
trap 'echo "Backup incomplete, inspect $DEST" >&2' ERR
# Never dump/print .env, never upload raw backups to GitHub.
docker compose -f compose.yaml exec -T postgres pg_dump -U chatwoot -d chatwoot -Fc > "$DEST/postgres.dump"
docker compose -f compose.yaml exec -T rails tar -C /app -czf - storage > "$DEST/storage.tar.gz"
(cd "$DEST" && sha256sum postgres.dump storage.tar.gz > SHA256SUMS)
echo "Encrypted off-host backup still required. Local backup saved to $DEST"
