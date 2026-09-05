#!/usr/bin/env bash
# Concatenate a range of migrations into ONE transactional file, for pasting
# into the Supabase SQL editor in a single go.
#
#   ./supabase/post-deploy/bundle-migrations.sh 0012 0018 > catch-up.sql
#   ./supabase/post-deploy/bundle-migrations.sh 0012 0018 --seed > catch-up.sql
#
# WHY THIS EXISTS
# ---------------
# Applying migrations by hand means opening a file, copying its contents,
# pasting, running, and repeating — once per file. Seven repetitions is seven
# chances to paste the wrong thing, skip one, or run them out of order, and a
# database several migrations behind reports itself as a scatter of unrelated
# errors rather than as one problem. One paste removes all of that.
#
# WHY IT IS A SCRIPT AND NOT A COMMITTED .sql FILE
# ------------------------------------------------
# A checked-in concatenation is a second copy of every migration, and the copy
# goes stale the moment a migration is touched. Generating it on demand means
# there is only ever one source of truth.
#
# THE TRANSACTION MATTERS
# -----------------------
# The output is wrapped in begin/commit, so the whole range applies or none of
# it does. Without that, a failure partway leaves a database in a state no file
# describes — which has happened in this project already (0014 aborted on a
# missing function and left the waitlist table uncreated, invisibly).

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <from> <to> [--seed]" >&2
  echo "   e.g. $0 0012 0018 --seed" >&2
  exit 64
fi

FROM="$1"
TO="$2"
WITH_SEED="${3:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

files=()
for f in "$ROOT"/supabase/migrations/0*.sql; do
  n="$(basename "$f" | cut -c1-4)"
  if [[ "$n" > "$FROM" || "$n" == "$FROM" ]] && [[ "$n" < "$TO" || "$n" == "$TO" ]]; then
    files+=("$f")
  fi
done

if [ ${#files[@]} -eq 0 ]; then
  echo "no migrations in range $FROM..$TO" >&2
  exit 1
fi

# The mail templates are a seed, not a migration: 0013 creates the table, this
# fills it. Without it the mail-template screen is empty and no mail goes out,
# which looks like a bug rather than a missing step.
if [ "$WITH_SEED" = "--seed" ]; then
  files+=("$ROOT/supabase/seed/mail_templates.sql")
fi

{
  echo "-- ====================================================================="
  echo "-- Sammel-Migration $FROM → $TO"
  echo "--"
  echo "-- Erzeugt aus dem Repository mit supabase/post-deploy/bundle-migrations.sh."
  echo "-- Enthält den Inhalt dieser Dateien, in genau dieser Reihenfolge:"
  echo "--"
  for f in "${files[@]}"; do
    echo "--   ${f#"$ROOT/"}"
  done
  cat <<'HDR'
--
-- ALLES ODER NICHTS: die ganze Datei läuft in EINER Transaktion. Schlägt
-- irgendetwas fehl, wird alles zurückgerollt und die Datenbank bleibt exakt so,
-- wie sie vorher war. Ein halb angewendeter Zustand kann nicht entstehen.
--
-- ANWENDUNG: komplett markieren, in den Supabase-SQL-Editor einfügen, Run.
-- Danach supabase/post-deploy/check-schema.sql laufen lassen — es muss
-- "0 fehlend" melden.
--
-- Erwartete Meldungen, die KEIN Fehler sind:
--   NOTICE: drop cascades to N other objects   (0016 baut die Policies neu auf)
--   NOTICE: trigger "..." does not exist, skipping
-- =====================================================================

begin;
HDR

  for f in "${files[@]}"; do
    printf '\n\n-- ===== %s =====\n\n' "${f#"$ROOT/"}"
    cat "$f"
  done

  printf '\n\ncommit;\n'
}
