# Unified Telegram Store Bot (Chatwoot sidecar)

A **single Telegram bot** serves two audiences: customers send messages/files to the existing Chatwoot Telegram inbox; owner and approved support agents use bot commands and a Telegram Mini App to operate the **same** Chatwoot conversations. This is an isolated, upstream-friendly extension, not a replacement for Chatwoot or its database.

**Status:** implementation committed for review; no real BotFather credentials, HTTPS endpoint, Chatwoot inbox, production deployment, or live end-to-end test are provisioned by this code. This extension is not included automatically in the upstream Chatwoot Docker image.

## Architecture

Telegram → **HTTPS reverse proxy** → `telegram-unified-bot:8080/telegram/webhook` → staff role router:
- **Customer**: the original JSON update is forwarded unchanged to Chatwoot's `/webhooks/telegram/<bot_token>`. Chatwoot persists the contact/conversation, handles files and sends replies through its existing Telegram channel.
- **Owner/agent**: private-chat commands are handled by this sidecar using Chatwoot's account REST API. They are not stored as customer messages.
- **Mini App**: same sidecar serves `/app` and role-enforced `/api/*`, using Telegram's signed `initData` identity. No Chatwoot API credential is exposed to the browser.

There is only **one** Telegram webhook for the bot. Chatwoot's built-in Telegram inbox must be created first; then Telegram's webhook is registered to this adapter. If Chatwoot reconfigures the inbox and resets the webhook to itself, re-register the adapter's webhook.

## Prerequisites

1. An existing running Chatwoot instance with PostgreSQL, Redis and Sidekiq, account with an administrator API access token, and a **Telegram inbox created using the exact same BotFather token**.
2. A public HTTPS hostname/proxy (for example `https://bot.example.com`) serving this sidecar at `/telegram/webhook` and `/app`. Telegram cannot deliver updates to a localhost-only URL. Don't expose the plain HTTP container port directly to the public internet.
3. Your Telegram numeric ID (and each approved support agent's Telegram numeric ID). Map a support agent to the **existing Chatwoot user ID**, not a contact ID.
4. A strong random `TELEGRAM_WEBHOOK_SECRET`. Never commit tokens, admin API keys, or a real `.env`.

## Configuration

Copy `.env.example` to **this directory's** `.env`; populate `BOT_TOKEN`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `OWNER_TELEGRAM_IDS`, `AGENT_MAP_JSON`, and `PUBLIC_BASE_URL`.

Example:
- `OWNER_TELEGRAM_IDS=111111111,222222222` means either ID has owner-level permissions.
- `AGENT_MAP_JSON={"333333333":17}` allows Telegram ID 333333333 to act **only** on conversations assigned to Chatwoot agent ID 17.
- The agent must still exist in Chatwoot; removing that agent revokes access.

- `AGENT_API_TOKENS_JSON={"333333333":"PASTE_AGENT_USER_API_TOKEN"}`: **required** for each agent mapped in `AGENT_MAP_JSON`. The account owner key is used only for owner actions, agent existence checks and global operations; agent-facing Chatwoot API calls use the assigned agent's actual Chatwoot account token. This ensures messages are attributed to the correct agent and upstream Chatwoot policies also apply. Never use the owner token for agents. The server refuses to start when a configured agent is missing a token.

**Security note:** the adapter uses an owner/admin Chatwoot API key server-side, so access controls are enforced in the adapter and must remain strict. Keep its process and configuration private. Token rotation, Telegram webhook control, and upstream Chatwoot permissions must all be maintained.

## Docker Compose (example with this fork's production Compose)

Run from the **repository root** after reviewing your existing Chatwoot production deployment:

```sh
docker compose -f docker-compose.production.yaml -f integrations/telegram-unified-bot/compose.yaml config
docker compose -f docker-compose.production.yaml -f integrations/telegram-unified-bot/compose.yaml up -d --build telegram-unified-bot
```

The Compose overlay publishes only `127.0.0.1:8088` on the host; route public HTTPS traffic to this port with your existing reverse proxy. It does not change Rails, DB, Redis, or Sidekiq definitions. If Chatwoot is not deployed using the upstream Compose stack, attach the sidecar to that deployment's network and adjust `CHATWOOT_BASE_URL`.

**Webhook cutover:** first use `AUTO_REGISTER_WEBHOOK=false` and verify prerequisites. Then set it to `true` and restart **only** `telegram-unified-bot`; it calls Telegram Bot API `setWebhook` with a secret-token header and allowed update types. Verify `https://bot.example.com/healthz` and Telegram `getWebhookInfo`. Telegram webhook must point to `https://bot.example.com/telegram/webhook`, **not** directly to Rails. Do not publish the secret header or credentials in logs.

To reverse the routing, set `AUTO_REGISTER_WEBHOOK=false` and reconfigure the original Telegram inbox's webhook through Chatwoot. Chatwoot remains the system of record.

## Features implemented in this sidecar

| Actor | Bot commands / Mini App | Server-side restrictions |
|---|---|---|
| Customer | Plain messages, images/files, support replies via Chatwoot, and support/order-inquiry/request guidance buttons | No access to Mini App API, staff commands, or Chatwoot account token |
| Owner | `/inbox [PAGE]`, `/reply ID text`, `/note ID text`, `/close ID`, `/open ID`, `/assign ID AGENT_ID`, `/agents`, `/customers`, `/stats`, `/performance` | Explicit Telegram ID allowlist |
| Agent | `/inbox`, `/reply`, `/note`, `/close`, `/open` | Explicit Telegram ID → Chatwoot agent mapping; conversation assignee checked before every read/write |
| Owner Mini App | Open conversations, message history, send reply/note, status/assignment, contacts, staff directory | Telegram Mini App signed `initData` (15-minute window), allowlist and live Chatwoot API |
| Agent Mini App | Own assigned conversations, history, replies/notes/status | All server endpoints enforce mapping/assignment; customer/team tabs hidden and forbidden |

The customer-facing order-inquiry button **only asks for the order number and routes the following message to a human**; automatic order status requires a separately connected store/order system.

The `/stats` and `/performance` commands use Chatwoot's **native V2 summary reports** (last 30 days) rather than estimates from conversation-list metadata. Reporting access is owner-only and requires an administrator-level Chatwoot API token. Conversation listings are currently **page-limited**, and an assigned conversation outside the first page may not appear in `/inbox`; it can still be addressed by known display ID. Advanced KPIs, sales/orders/payment reconciliation, push notifications to each staff member, and a complete Web-panel feature parity are **not implemented** here. These require additional integrations or supported API surfaces. Chatwoot's own dashboard remains available.

## Verification

```sh
cd integrations/telegram-unified-bot
node --test test/*.test.mjs
node --check src/server.mjs
node --check src/security.mjs
node --check src/chatwoot.mjs
```

Additional pre-activation checks are mandatory: owner and agent permissions; agent removed from Chatwoot; customer text, image and callback routing; Chatwoot-to-customer reply; notes not delivered to customers; update retries; actual Mini App `initData` verification; webhook secret rejection; reverse-proxy TLS; and a rollback of the webhook. Tests included here are **local unit/API-contract tests**, not proof of live functionality.

## Upgrade strategy

Keep changes isolated under `integrations/telegram-unified-bot/`; no modifications to upstream Rails models, controllers, migrations, or frontend are necessary. Regularly rebase/fetch official Chatwoot updates and recheck Telegram webhook/controller and account API contracts before deploying an upgrade.
