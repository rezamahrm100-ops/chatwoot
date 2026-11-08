#!/usr/bin/env bash
# Staged deployment for a fresh VPS. No destructive commands.
set -Eeuo pipefail
umask 077
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
ENV_FILE="$HERE/.env"
BOT_ENV="$HERE/.env.bot"
COMPOSE_FILE="$HERE/compose.yaml"
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing: $1"; }
setting() { grep -m1 "^$2=" "$1" | cut -d= -f2-; }
require_configs() {
  [[ -f "$ENV_FILE" && -f "$BOT_ENV" ]] || die "Run the prepare command first"
  [[ ! -L "$ENV_FILE" && ! -L "$BOT_ENV" ]] || die "Refusing symlinked credential files"
  ! grep -Eq '__GENERATE_|REPLACE_WITH_' "$ENV_FILE" || die "Uninitialized core credentials"
}
compose() {
  need docker
  docker compose --project-directory "$HERE" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}
prepare() {
  need openssl
  [[ ! -e "$ENV_FILE" && ! -e "$BOT_ENV" ]] || die "Configuration already exists; refusing overwrite"
  cp "$HERE/.env.example" "$ENV_FILE"
  cp "$HERE/.env.bot.example" "$BOT_ENV"
  chmod 600 "$ENV_FILE" "$BOT_ENV"
  local postgres redis base primary deterministic salt secret
  postgres="$(openssl rand -hex 32)"
  redis="$(openssl rand -hex 32)"
  base="$(openssl rand -hex 64)"
  primary="$(openssl rand -hex 32)"
  deterministic="$(openssl rand -hex 32)"
  salt="$(openssl rand -hex 32)"
  secret="$(openssl rand -hex 32)"
  sed -i -e "s/__GENERATE_POSTGRES_PASSWORD__/$postgres/g" \
    -e "s/__GENERATE_REDIS_PASSWORD__/$redis/g" \
    -e "s/__GENERATE_SECRET_KEY_BASE__/$base/g" \
    -e "s/__GENERATE_ENC_PRIMARY__/$primary/g" \
    -e "s/__GENERATE_ENC_DETERMINISTIC__/$deterministic/g" \
    -e "s/__GENERATE_ENC_SALT__/$salt/g" "$ENV_FILE"
  sed -i -e "s/__GENERATE_WEBHOOK_SECRET__/$secret/g" "$BOT_ENV"
  printf '%s\n' 'Private config generated; secrets not printed. Configure actual domains before public startup.'
}
validate_domains() {
  local chat bot email frontend publicurl
  chat="$(setting "$ENV_FILE" CHATWOOT_DOMAIN)"
  bot="$(setting "$ENV_FILE" BOT_DOMAIN)"
  email="$(setting "$ENV_FILE" ACME_EMAIL)"
  frontend="$(setting "$ENV_FILE" FRONTEND_URL)"
  publicurl="$(setting "$BOT_ENV" PUBLIC_BASE_URL)"
  [[ "$chat" =~ ^[a-zA-Z0-9.-]+$ && "$bot" =~ ^[a-zA-Z0-9.-]+$ ]] || die "Invalid domain"
  [[ "$chat" != "$bot" && "$chat" != *example.com && "$bot" != *example.com ]] || die "Configure distinct real domains"
  [[ "$email" == *@* && "$email" != *example.com ]] || die "Configure real ACME_EMAIL"
  [[ "$frontend" == "https://$chat" && "$publicurl" == "https://$bot" ]] || die "Configured HTTPS URL and domain mismatch"
}
validate_bot() {
  require_configs
  validate_domains
  [[ "$(setting "$BOT_ENV" BOT_TOKEN)" != REPLACE_WITH* ]] || die "Missing real BOT_TOKEN"
  [[ "$(setting "$BOT_ENV" CHATWOOT_API_TOKEN)" != REPLACE_WITH* ]] || die "Missing Chatwoot admin API token"
  local owners secret
  owners="$(setting "$BOT_ENV" OWNER_TELEGRAM_IDS)"
  secret="$(setting "$BOT_ENV" TELEGRAM_WEBHOOK_SECRET)"
  [[ "$owners" =~ ^[0-9]+(,[0-9]+)*$ ]] || die "Invalid owner Telegram IDs"
  [[ "$secret" =~ ^[a-zA-Z0-9_-]{32,256}$ ]] || die "Invalid webhook secret"
}
command=help
if [[ $# -gt 0 ]]; then command="$1"; fi
case "$command" in
  prepare)
    prepare ;;
  check)
    require_configs
    compose --profile bot --profile public config --quiet
    echo 'COMPOSE_CONFIG=PASS; live credentials and DNS not checked' ;;
  core)
    require_configs
    compose up -d postgres redis
    compose run --rm rails bundle exec rails db:chatwoot_prepare
    compose up -d rails sidekiq
    echo 'CORE_START_REQUESTED — check service health' ;;
  public)
    require_configs
    validate_domains
    compose --profile public up -d caddy
    echo 'TLS_START_REQUESTED — check DNS and certificates' ;;
  bot)
    validate_bot
    [[ "$(setting "$BOT_ENV" AUTO_REGISTER_WEBHOOK)" == false ]] ||
      die "First boot must not change Telegram webhook"
    compose --profile bot up -d --build telegram-unified-bot
    echo 'BOT_STARTED; webhook unchanged' ;;
  activate-webhook)
    [[ $# -ge 2 && "$2" == --inbox-ready ]] ||
      die "First create same-token Telegram inbox in Chatwoot; pass --inbox-ready"
    validate_bot
    need curl
    curl --silent --show-error --fail --max-time 12 "$(setting "$BOT_ENV" PUBLIC_BASE_URL)/healthz" >/dev/null ||
      die "Gateway HTTPS endpoint not reachable"
    cp "$BOT_ENV" "$BOT_ENV.before-webhook-$(date -u +%Y%m%dT%H%M%SZ).bak"
    sed -i 's/^AUTO_REGISTER_WEBHOOK=.*/AUTO_REGISTER_WEBHOOK=true/' "$BOT_ENV"
    if ! compose --profile bot up -d --force-recreate telegram-unified-bot; then
      sed -i 's/^AUTO_REGISTER_WEBHOOK=.*/AUTO_REGISTER_WEBHOOK=false/' "$BOT_ENV"
      die "Activation did not succeed; inspect Telegram webhook before retry"
    fi
    echo 'WEBHOOK_SWITCH_REQUESTED — verify getWebhookInfo and real message round trip' ;;
  status)
    require_configs
    compose --profile bot --profile public ps ;;
  *)
    cat <<'USAGE'
Usage: bash deploy/vps/vps.sh prepare|check|core|public|bot|status
After Chatwoot inbox exists: bash deploy/vps/vps.sh activate-webhook --inbox-ready
There is no cleanup, volume deletion or automatic deployment command.
USAGE
    ;;
esac
