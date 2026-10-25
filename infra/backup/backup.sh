#!/bin/sh
# Nightly backup for the `backup` service in docker-compose.yml (postgres:17-alpine, busybox sh).
# Waits for 03:00 local time (TZ), writes /backups/family-YYYY-MM-DD.dump (pg_dump custom format,
# for pg_restore), deletes dumps older than 14 days, then waits for the next day.
# BACKUP_RUN_NOW=1 makes one dump right away and exits (infra/README.md):
#   docker compose -p family run --rm -e BACKUP_RUN_NOW=1 backup
# The connection comes from libpq's PGHOST, PGUSER, PGPASSWORD and PGDATABASE.
set -u

dir=/backups
at=03:00
keep_days=14

# The dumps hold the family's data: owner (root) only.
umask 077

log() {
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') backup: $*"
}

# Epoch seconds of the next $at in local time: today's, or tomorrow's once it has passed.
next_run() {
  now=$(date +%s)
  today=$(date +%F)
  next=$(date -d "$today $at:00" +%s)
  if [ "$next" -le "$now" ]; then
    # Noon + 24 h is tomorrow even when a DST change makes today 23 or 25 hours long.
    tomorrow=$(date -d "@$(($(date -d "$today 12:00:00" +%s) + 86400))" +%F)
    next=$(date -d "$tomorrow $at:00" +%s)
  fi
  echo "$next"
}

backup() {
  file="$dir/family-$(date +%F).dump"
  # Written under another name and renamed when complete, so a family-*.dump is never partial.
  if pg_dump -Fc -f "$file.partial"; then
    mv "$file.partial" "$file"
    deleted=$(find "$dir" -name 'family-*.dump' -mtime +"$keep_days" -print -delete | wc -l)
    log "wrote $file ($(wc -c <"$file") bytes), deleted $deleted dump(s) older than $keep_days days"
  else
    rm -f "$file.partial"
    log "pg_dump failed, previous dumps kept"
    return 1
  fi
}

if [ "${BACKUP_RUN_NOW:-}" = 1 ]; then
  backup
  exit
fi

# As PID 1 the shell ignores SIGTERM unless trapped; sleeping in the background lets
# `docker compose stop` end the wait at once instead of after the 10 s grace period.
trap 'exit 0' TERM INT

while :; do
  next=$(next_run)
  log "next dump at $(date -d "@$next" '+%Y-%m-%d %H:%M %Z')"
  sleep $((next - $(date +%s))) &
  wait $!
  backup
done
