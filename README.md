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
