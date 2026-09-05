#!/bin/sh
# Deploy auf dem VPS: Repo aktualisieren und Container neu bauen.
set -e
cd "$(dirname "$0")"
git pull
docker compose up -d --build
docker compose ps
