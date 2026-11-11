# Dedicated future VPS deployment

STATUS: BUILD-ONLY. The VPS has not been purchased or provisioned. No live BotFather key, Chatwoot admin key, HTTPS name, or Telegram webhook has been configured.

This bundle reuses the upstream official Chatwoot CE v4.19.1 image and adds an isolated one-bot Telegram gateway, PostgreSQL 16 with pgvector, Redis 7, Sidekiq, and Caddy for HTTPS. No upstream Rails core files are edited.

## Requirements after VPS purchase

Use a fresh Ubuntu 24.04 LTS server with Docker Engine, the Docker Compose plugin, a reachable public IP, two DNS hostnames pointing to the server, public TCP ports 80 and 443, and secure off-host database plus file backups. A starting capacity for a modest store is 4 vCPU, 8 GB RAM, and 60 GB SSD; actual requirements depend on workload. Configure SMTP for user invitations and password recovery.

The existing Windows runner builds and packages releases, rather than hosting the production system. GitHub Actions and Releases do not replace an always-on server.

## Staged activation (on VPS, not now)

Unpack the verified GitHub Actions bundle at its repository root or check out the feature branch. From the repository root:

    bash deploy/vps/vps.sh prepare

This generates strong random, private credentials in deploy/vps/.env and deploy/vps/.env.bot with restrictive file permissions. It never overwrites existing credentials. Change the example domains, ACME_EMAIL, FRONTEND_URL and PUBLIC_BASE_URL to the real DNS names, then:

    bash deploy/vps/vps.sh check
    bash deploy/vps/vps.sh core
    bash deploy/vps/vps.sh public
    bash deploy/vps/vps.sh status

The first command validates Docker Compose syntax only. The second runs persistent PostgreSQL, Redis, database initialization, Rails and Sidekiq. The third starts Caddy automatic TLS after DNS is ready. No database or Redis host ports are published, and Rails and the bot are reachable publicly only through Caddy.

ENABLE_ACCOUNT_SIGNUP=false is deliberate; arrange an initial administrator account through an approved, supervised Chatwoot setup process before live use. Do not leave public signup open unnecessarily. Add a Telegram inbox in Chatwoot using the same BotFather token. Then fill account ID, administrator API token, bot token, owner Telegram numeric IDs and individual agent IDs/tokens in deploy/vps/.env.bot.

Start the gateway first without changing Telegram's active webhook:

    bash deploy/vps/vps.sh bot

Only after the Chatwoot Telegram inbox and HTTPS gateway are configured:

    bash deploy/vps/vps.sh activate-webhook --inbox-ready

This is the explicit webhook handover. Validate Telegram getWebhookInfo and actual customer message, media, reply, note privacy, owner authorization, agent assignments, Mini App signed login, and rollback. The script does not prove the Chatwoot inbox exists; the --inbox-ready acknowledgement is required.

## Boundaries

- No real secrets belong in Git history, pull requests, CI logs or built artifacts.
- GitHub checks validate configuration and build the bot. They cannot establish readiness of an absent future server.
- The first Chatwoot admin, BotFather setup, Telegram inbox, DNS, SMTP, and production backups require real operator setup after buying the server.
- Persist named volumes and back up both PostgreSQL and Chatwoot uploaded files. This repository does not yet provide tested automatic backup restoration.
- Never issue docker compose down -v on a production database.
- The gateway's AUTO_REGISTER_WEBHOOK flag defaults to false to avoid taking control of an existing bot early.
- Upgrades to Chatwoot image versions require compatibility checks and a backup/rollback plan.
