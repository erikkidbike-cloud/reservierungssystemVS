#!/usr/bin/env bash
# Spins up a throwaway Postgres, applies the shim + every migration + the seed,
# then runs the SQL assertion suite. Verifies the schema, the overlap exclusion
# constraint, the RPC guards and the triggers without needing a Supabase project.
#
#   ./supabase/test/run-tests.sh
#
# Requires a local PostgreSQL 16 server binary set (initdb/pg_ctl/psql).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-5433}"
PGDATA="${PGDATA:-$(mktemp -d)/pgdata}"
# Socket lives beside the data dir and TCP is disabled entirely (listen_addresses=''),
# so a throwaway cluster can never collide with another Postgres on this machine.
SOCKDIR="${SOCKDIR:-$(dirname "$PGDATA")/sock}"
DB=vstest

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> initdb ($PGDATA)"
rm -rf "$PGDATA" "$SOCKDIR"
mkdir -p "$PGDATA" "$SOCKDIR"
if [ "$(id -u)" -eq 0 ]; then
  # postgres refuses to run as root; drop to the postgres system user.
  chown -R postgres:postgres "$(dirname "$PGDATA")" "$PGDATA" "$SOCKDIR"
  RUN() { su postgres -c "$*"; }
else
  RUN() { eval "$@"; }
fi

RUN "$PGBIN/initdb -D $PGDATA -A trust -E UTF8" >/dev/null
RUN "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/server.log \
     -o \"-k $SOCKDIR -p $PGPORT -c listen_addresses=''\" -w start" >/dev/null

export PGHOST="$SOCKDIR" PGPORT PGUSER=postgres
psql -q -d postgres -c "drop database if exists $DB;" >/dev/null
psql -q -d postgres -c "create database $DB;" >/dev/null

echo "==> shim"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/test/00_supabase_shim.sql"

echo "==> migrations"
for f in "$ROOT"/supabase/migrations/0*.sql; do
  echo "    $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

echo "==> seed"
# Order matters: nv_clauses.sql looks up locations by code, so seed.sql (which
# creates them) must run first.
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/seed/seed.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/seed/nv_clauses.sql"

echo "==> tests"
# psql prefixes notices with "psql:file:line: " — strip that for readable output.
# ON_ERROR_STOP + set -e mean any failed assertion aborts this script non-zero.
for f in "$ROOT"/supabase/test/*.test.sql; do
  echo "    $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" 2>&1 \
    | sed -E 's/^psql:[^ ]+ //' \
    | grep -E '(NOTICE|ERROR|^---)' \
    | sed -E 's/^NOTICE: +//'
done

echo "==> OK — all assertions passed"
