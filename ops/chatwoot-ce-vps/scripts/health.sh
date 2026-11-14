#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for service in postgres redis rails sidekiq; do
  docker compose -f compose.yaml ps --status running --services | grep -qx "$service" || {
    echo "NOT_RUNNING: $service" >&2; exit 1;
  }
done
# A redirect is healthy for private loopback probes when external TLS is configured.
code="$(curl -sS -o /dev/null --max-time 15 -w '%{http_code}' http://127.0.0.1:3001/)"
case "$code" in
  200|301|302|303|307|308) echo "CHATWOOT_HEALTHY http=${code}" ;;
  *) echo "CHATWOOT_UNHEALTHY http=${code}" >&2; exit 1 ;;
esac
