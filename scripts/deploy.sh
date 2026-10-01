#!/usr/bin/env bash
# Run this on the VPS, inside the project directory, to update and restart the bot.
set -euo pipefail

git pull
docker compose build
docker compose up -d
docker image prune -f
