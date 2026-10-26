#!/usr/bin/env bash
# Create a database and user for a new project on the shared Postgres.
#   ./add-database.sh guildie
# Prints the DATABASE_URL to give that project's service in docker-compose.yml.
set -euo pipefail
name="${1:?usage: ./add-database.sh <name> (lowercase letters, numbers, underscores)}"
[[ "$name" =~ ^[a-z][a-z0-9_]*$ ]] || { echo "Use lowercase letters, numbers and underscores."; exit 1; }

cd "$(dirname "$0")"
password="$(openssl rand -hex 24)"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres <<SQL
CREATE ROLE $name WITH LOGIN PASSWORD '$password';
CREATE DATABASE $name OWNER $name;
SQL

echo
echo "Created database '$name'. Add this to .env:"
echo "  $(echo "$name" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD=$password"
echo "and give the service:"
echo "  DATABASE_URL: postgres://$name:\${$(echo "$name" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD}@db:5432/$name"
