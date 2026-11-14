#!/usr/bin/env bash
# Idempotent, single-stack deploy. Requires a dedicated reviewed VPS runner with Docker access.
set -euo pipefail
umask 077
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${CHATWOOT_STACK_DIR:-/opt/chatwoot-ce}"
[[ "$DEST" = /opt/chatwoot-ce ]] || { echo 'Only the dedicated /opt/chatwoot-ce path is permitted' >&2; exit 1; }
[[ "$SRC" != "$DEST" ]] || { echo 'Run this deployment from the verified Release extraction, not directly from the live stack' >&2; exit 1; }
[[ -d "$DEST" ]] || { echo 'Provision /opt/chatwoot-ce for dedicated runner user first; refusing privileged filesystem changes' >&2; exit 1; }
[[ -w "$DEST" ]] || { echo 'Dedicated runner cannot write its own stack directory' >&2; exit 1; }
# Read-only checks first, without touching existing projects or existing .env.
if [[ -f "$DEST/.env" ]]; then
  (cd "$DEST" && bash scripts/preflight.sh)
  if (cd "$DEST" && docker compose -f compose.yaml ps --status running --services) | grep -qx postgres; then
    (cd "$DEST" && bash scripts/backup.sh)
  fi
fi
# Stage only our package files; never replace .env or user data.
install -m 0644 "$SRC/compose.yaml" "$DEST/compose.yaml"
mkdir -p "$DEST/scripts"
for s in init-env.sh preflight.sh health.sh backup.sh deploy.sh; do
  install -m 0750 "$SRC/scripts/$s" "$DEST/scripts/$s"
done
if [[ ! -f "$DEST/.env" ]]; then
  (cd "$DEST" && bash scripts/init-env.sh)
fi
(cd "$DEST" && bash scripts/preflight.sh)
cd "$DEST"
# Pull official pinned Community Edition and fixed infrastructure major versions only.
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d --wait postgres redis
docker compose -f compose.yaml run --rm rails bundle exec rails db:chatwoot_prepare
docker compose -f compose.yaml up -d --no-deps rails sidekiq
for n in $(seq 1 24); do
  if bash scripts/health.sh; then echo 'DEPLOY_SUCCESS'; exit 0; fi
  sleep 5
done
echo 'Deployment health failed. Existing data/volumes preserved; review Chatwoot-only logs.' >&2
exit 1
