#!/bin/bash
# Arranque de DermaCare en el entorno de vista previa (PostgreSQL local + Express).
# No es necesario para Render: allí se usa `npm start`.
set -e
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
fi
PGVER=$(ls /usr/lib/postgresql | sort -n | tail -1)
pg_ctlcluster "$PGVER" main start 2>/dev/null || true
until pg_isready -q; do sleep 1; done
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='dermacare'\"" | grep -q 1 || \
  su postgres -c "psql -c \"CREATE USER dermacare WITH PASSWORD 'dermacare_dev' CREATEDB;\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='dermacare'\"" | grep -q 1 || \
  su postgres -c "psql -c \"CREATE DATABASE dermacare OWNER dermacare;\""
su postgres -c "psql -d dermacare -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'" >/dev/null
cd "$(dirname "$0")/../backend"
[ -d node_modules ] || npm install

# En la vista previa, el proxy envía /api al puerto 8001: liberar ese puerto
if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl status backend 2>/dev/null | grep -q RUNNING && supervisorctl stop backend >/dev/null 2>&1 || true
fi

node src/server.js &
until curl -sf http://localhost:${PORT:-3000}/api/salud >/dev/null; do sleep 1; done
PORT=8001 SKIP_DB_INIT=true node src/server.js &
wait -n
exit 1
