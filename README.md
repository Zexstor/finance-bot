# Finance Bot

A family Telegram bot for tracking personal finances. Built as a portfolio project
to demonstrate AI automation skills.

## Features (MVP)

- Log expenses via text, voice message, or receipt photo (AI parses the amount and assigns a category)
- Log income
- Monthly report: income vs. goal, expenses by category
- Restricted access for two users (family members)

## Tech stack

- Node.js + TypeScript
- [grammY](https://grammy.dev/) — Telegram bot framework
- [Supabase](https://supabase.com/) — database
- AI API — expense parsing and receipt recognition
- Whisper — voice message transcription
- Docker — containerization
- Deployed on a personal Ubuntu VPS

## Status

🚧 Early development. See `CLAUDE.md` for project rules and conventions.

## Setup

```bash
cp .env.example .env
# fill in .env with your own values
npm install
npm run dev
```

(Setup instructions will be expanded as the project progresses.)

## Deployment (Ubuntu VPS)

The bot uses Telegram long polling, not webhooks, so the VPS needs no open inbound
ports, no domain, and no TLS certificate — only outbound internet access.

**One-time server setup (manual):**

```bash
# install Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect
```

**First deploy (manual):**

```bash
git clone <this-repo-url>
cd finance-bot
cp .env.example .env
nano .env   # fill in production secrets
docker compose up -d --build
```

**Every later deploy (automated via script):**

```bash
./scripts/deploy.sh
```

This pulls the latest code, rebuilds the image, and restarts the container.

**Logs, one command:**

```bash
docker compose logs -f --tail=100 bot
```

**Auto-restart:** `restart: unless-stopped` in `docker-compose.yml` restarts the bot
if it crashes or the VPS reboots (as long as the Docker daemon itself is enabled on
boot, which `get.docker.com` sets up by default).
