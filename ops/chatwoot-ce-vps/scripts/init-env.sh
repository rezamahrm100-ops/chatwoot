#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
if [[ -e "$ENV_FILE" ]]; then
  echo "Existing private .env preserved; no changes made."
  exit 0
fi
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
FRONTEND_URL="${CHATWOOT_FRONTEND_URL:-http://127.0.0.1:3001}"
case "$FRONTEND_URL" in
  https://*) FORCE_SSL=true ;;
  http://127.0.0.1:3001) FORCE_SSL=false ;;
  *) echo 'Only HTTPS public frontend URLs or private localhost test URL are allowed' >&2; exit 1 ;;
esac
# Values are written only to the server-local .env with 0600 permissions.
CHATWOOT_FRONTEND_URL="$FRONTEND_URL" CHATWOOT_FORCE_SSL="$FORCE_SSL" python3 - "$ENV_FILE" <<'PY'
import os, secrets, sys
from pathlib import Path
p=Path(sys.argv[1])
url=os.environ['CHATWOOT_FRONTEND_URL']
force=os.environ['CHATWOOT_FORCE_SSL']
def rnd(n=32): return secrets.token_hex(n)
vals={
 'SECRET_KEY_BASE':rnd(64),
 'POSTGRES_PASSWORD':rnd(32),
 'REDIS_PASSWORD':rnd(32),
 'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY':rnd(32),
 'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY':rnd(32),
 'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT':rnd(32),
 'FRONTEND_URL':url,
 'FORCE_SSL':force,
 'ENABLE_ACCOUNT_SIGNUP':'true',
 'ENABLE_PUSH_RELAY_SERVER':'true',
 'POSTGRES_HOST':'postgres',
 'POSTGRES_PORT':'5432',
 'POSTGRES_USERNAME':'chatwoot',
 'POSTGRES_DATABASE':'chatwoot',
 'REDIS_URL':'redis://redis:6379',
 'RAILS_ENV':'production',
 'NODE_ENV':'production',
 'INSTALLATION_ENV':'docker',
 'ACTIVE_STORAGE_SERVICE':'local',
 'RAILS_LOG_TO_STDOUT':'true',
 'LOG_LEVEL':'info',
 'RAILS_MAX_THREADS':'5',
 'SIDEKIQ_CONCURRENCY':'10',
 'MAILER_SENDER_EMAIL':'Chatwoot <noreply@example.invalid>',
}
fd=os.open(p, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
with os.fdopen(fd,'w') as f:
 for k,v in vals.items(): f.write(f'{k}={v}\n')
print('Private .env created with mode 0600; credentials not displayed.')
PY
