#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo 'Preflight: checking shared VPS without modifying other services'
[[ "$(uname -s)" = Linux ]] || { echo 'Linux VPS required' >&2; exit 1; }
[[ "$(uname -m)" = x86_64 || "$(uname -m)" = aarch64 ]] || { echo 'Unsupported CPU architecture' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker missing' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Runner has no working Docker access; configure a dedicated trusted VPS deploy runner' >&2; exit 1; }
docker compose version >/dev/null || { echo 'Docker Compose missing' >&2; exit 1; }
command -v ss >/dev/null || { echo 'ss missing' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl missing' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 missing' >&2; exit 1; }
cpus="$(nproc)"
mem_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
disk_kib="$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')"
echo "CPU=${cpus}, available RAM=$((mem_kib/1024/1024))GiB, available disk=$((disk_kib/1024/1024))GiB"
(( cpus >= 4 )) || { echo 'Less than four CPU cores' >&2; exit 1; }
(( mem_kib >= 5*1024*1024 )) || { echo 'Less than 5GiB of available RAM' >&2; exit 1; }
(( disk_kib >= 25*1024*1024 )) || { echo 'Less than 25GiB of available disk; stop before deployment' >&2; exit 1; }
# Never reuse a host port already owned by a different service.
if ss -H -lnt '( sport = :3001 )' | grep -q .; then
  if ! docker compose -f compose.yaml ps --status running --services 2>/dev/null | grep -qx rails; then
    echo '127.0.0.1:3001 already has a listener; refusing to collide' >&2
    exit 1
  fi
fi
if [[ -f .env ]]; then
  perms="$(stat -c %a .env)"
  [[ "$perms" = 600 ]] || { echo ".env permissions are ${perms}, expected 600" >&2; exit 1; }
  docker compose -f compose.yaml config --quiet
fi
# This script deliberately does not restart, prune, remove or inspect Blinko/Newsroom volumes.
echo 'PREFLIGHT_OK'
