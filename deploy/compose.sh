#!/usr/bin/env bash
# docker compose for the production stack, with the right project name, file and env file.
#   ./deploy/compose.sh up -d --build      ./deploy/compose.sh ps      ./deploy/compose.sh logs -f api
# ENV_FILE=deploy/.env.rehearsal ./deploy/compose.sh ...   uses another env file (for example a local rehearsal).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
env_file="${ENV_FILE:-$here/.env.prod}"
case "$env_file" in /*) ;; *) env_file="$(pwd)/$env_file" ;; esac
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy deploy/.env.prod.example to deploy/.env.prod and fill it in." >&2
  exit 1
fi
project="$(grep -E '^COMPOSE_PROJECT_NAME=' "$env_file" | tail -1 | cut -d= -f2-)"
exec docker compose -p "${project:-wildward}" --env-file "$env_file" -f "$here/docker-compose.prod.yml" "$@"
