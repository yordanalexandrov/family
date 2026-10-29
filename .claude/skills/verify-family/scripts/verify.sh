#!/usr/bin/env bash
# Disposable verification stack for the family app: its own Postgres container, api and Vite
# on free loopback ports, nothing shared with `pnpm dev`, the compose stack or the test database.
#
#   verify.sh up                 start a new run, print its id, ports and dirs
#                                (WEB_MODE=preview: production build + vite preview, service worker on)
#   verify.sh doctor [run]       read-only: is this run's instance worth driving?
#   verify.sh env [run]          print RUN_ID, WEB_URL, API_URL, ... as shell assignments
#   verify.sh psql [run] -c SQL  query the run's database (read side effects)
#   verify.sh down [run]         stop what this run started; evidence stays
#   verify.sh list               runs under $FAMILY_VERIFY_HOME and whether they are up
#
# [run] defaults to the latest run. Everything lives in $FAMILY_VERIFY_HOME/<run>/
# (default /tmp/family-verify): state, logs, browser profile and evidence/.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
HOME_DIR="${FAMILY_VERIFY_HOME:-/tmp/family-verify}"
DEV_EMAIL="verify@example.test"
DANI_ID="11111111-1111-4111-8111-111111111111" # seed user Дани (drizzle/0001_seed_users.sql)
PG_IMAGE="postgres:17-alpine"

die() { echo "verify: $*" >&2; exit 1; }
log() { echo "verify: $*" >&2; }

# Node >= 24.15 (pnpm engines); the system node may be older, so fall back to nvm's newest 24.x.
find_node_bin() {
  local v
  if v="$(node -v 2>/dev/null)" && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>24||(a===24&&b>=15)?0:1)'; then
    dirname "$(command -v node)"; return
  fi
  local cand
  cand="$(ls -d "${NVM_DIR:-$HOME/.nvm}"/versions/node/v2[4-9].* 2>/dev/null | sort -V | tail -1 || true)"
  [[ -n "$cand" && -x "$cand/bin/node" ]] || die "need Node >= 24.15 (have ${v:-none}); install with: nvm install 24"
  echo "$cand/bin"
}

free_port() {
  "$NODE_BIN/node" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

resolve_run() {
  local run="${1:-}"
  if [[ -z "$run" ]]; then
    [[ -L "$HOME_DIR/latest" ]] || die "no runs yet; start one with: verify.sh up"
    run="$(basename "$(readlink "$HOME_DIR/latest")")"
  fi
  [[ -f "$HOME_DIR/$run/run.env" ]] || die "unknown run '$run' (see verify.sh list)"
  echo "$run"
}

load_run() {
  RUN_ID="$(resolve_run "${1:-}")"
  RUN_DIR="$HOME_DIR/$RUN_ID"
  # shellcheck disable=SC1091
  source "$RUN_DIR/run.env"
}

alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# The pid listening on 127.0.0.1:<port>, if any.
port_pid() { ss -Htlnp "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

wait_for() { # <seconds> <description> <command...>
  local secs="$1" what="$2"; shift 2
  for _ in $(seq "$secs"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

worktree_fingerprint() {
  (cd "$REPO" && { git rev-parse HEAD:apps/api HEAD:packages/shared; git diff HEAD -- apps/api packages/shared; git ls-files -o --exclude-standard -- apps/api packages/shared; } | sha1sum | cut -c1-12)
}

cmd_up() {
  NODE_BIN="$(find_node_bin)"
  command -v docker >/dev/null || die "docker is required"
  [[ -x "$REPO/apps/api/node_modules/.bin/tsx" && -x "$REPO/apps/web/node_modules/.bin/vite" ]] \
    || die "dependencies missing; run: PATH=$NODE_BIN:\$PATH corepack pnpm install"
  [[ -d "$(dirname "${BASH_SOURCE[0]}")/node_modules/playwright-core" ]] \
    || die "browser driver missing; run: (cd $(dirname "${BASH_SOURCE[0]}") && PATH=$NODE_BIN:\$PATH npm install)"

  RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
  RUN_DIR="$HOME_DIR/$RUN_ID"
  mkdir -p "$RUN_DIR/logs" "$RUN_DIR/evidence" "$RUN_DIR/profile"
  ln -sfn "$RUN_DIR" "$HOME_DIR/latest"

  local pg_port api_port web_port container
  pg_port="$(free_port)"; api_port="$(free_port)"; web_port="$(free_port)"
  container="family-verify-$RUN_ID"
  cat > "$RUN_DIR/run.env" <<EOF
RUN_ID=$RUN_ID
RUN_DIR=$RUN_DIR
REPO=$REPO
NODE_BIN=$NODE_BIN
PG_CONTAINER=$container
PG_PORT=$pg_port
API_PORT=$api_port
WEB_PORT=$web_port
API_URL=http://127.0.0.1:$api_port
WEB_URL=http://127.0.0.1:$web_port
DEV_EMAIL=$DEV_EMAIL
EVIDENCE_DIR=$RUN_DIR/evidence
FINGERPRINT=$(worktree_fingerprint)
EOF

  log "run $RUN_ID: postgres $container on 127.0.0.1:$pg_port"
  docker run -d --name "$container" --label family-verify="$RUN_ID" \
    -e POSTGRES_DB=family -e POSTGRES_USER=family -e POSTGRES_PASSWORD=verify \
    --tmpfs /var/lib/postgresql/data -p "127.0.0.1:$pg_port:5432" "$PG_IMAGE" >/dev/null
  wait_for 60 postgres docker exec "$container" pg_isready -U family -d family -h 127.0.0.1 \
    || die "postgres did not become ready (docker logs $container)"

  # api without --env-file and with a clean environment: no repo .env, no Google/Wallet, OpenClaw off.
  log "api on 127.0.0.1:$api_port (log: $RUN_DIR/logs/api.log)"
  (cd "$REPO/apps/api" && exec setsid env -i PATH="$NODE_BIN:/usr/bin:/bin" HOME="$HOME" TZ=Europe/Sofia \
    NODE_ENV=development AUTH_MODE=dev DEV_USER_EMAIL="$DEV_EMAIL" LOG_LEVEL=info \
    API_HOST=127.0.0.1 API_PORT="$api_port" \
    DATABASE_URL="postgres://family:verify@127.0.0.1:$pg_port/family" \
    OPENCLAW_URL=http://127.0.0.1:9 OPENCLAW_GATEWAY_PASSWORD= \
    ./node_modules/.bin/tsx src/server.ts >"$RUN_DIR/logs/api.log" 2>&1 < /dev/null) &
  echo "API_PID=$!" >> "$RUN_DIR/run.env"

  # WEB_MODE=preview: production build + `vite preview` (same /api proxy), so the service worker
  # registers and the app shell opens offline. Default `dev`: Vite dev server with hot reload.
  local vite_cmd=(./node_modules/.bin/vite --host 127.0.0.1 --port "$web_port" --strictPort --clearScreen false)
  if [[ "${WEB_MODE:-dev}" == preview ]]; then
    log "web build for preview (log: $RUN_DIR/logs/web-build.log)"
    (cd "$REPO/apps/web" && env PATH="$NODE_BIN:$PATH" ./node_modules/.bin/vite build \
      --outDir "$RUN_DIR/web-dist" --emptyOutDir >"$RUN_DIR/logs/web-build.log" 2>&1) \
      || die "web build failed (see $RUN_DIR/logs/web-build.log); run: verify.sh down $RUN_ID"
    vite_cmd=(./node_modules/.bin/vite preview --outDir "$RUN_DIR/web-dist" --host 127.0.0.1 \
      --port "$web_port" --strictPort)
  fi
  log "web (${WEB_MODE:-dev}) on 127.0.0.1:$web_port (log: $RUN_DIR/logs/web.log)"
  (cd "$REPO/apps/web" && exec setsid env PATH="$NODE_BIN:$PATH" API_PORT="$api_port" \
    "${vite_cmd[@]}" >"$RUN_DIR/logs/web.log" 2>&1 < /dev/null) &
  echo "WEB_PID=$!" >> "$RUN_DIR/run.env"

  load_run "$RUN_ID"
  wait_for 90 api bash -c "curl -fsS $API_URL/healthz | grep -q '\"db\":\"ok\"'" \
    || { tail -30 "$RUN_DIR/logs/api.log" >&2; die "api not healthy; run: verify.sh down $RUN_ID"; }
  wait_for 60 web bash -c "curl -fsS -H 'X-Acting-User: $DANI_ID' $WEB_URL/api/me | grep -q '$DEV_EMAIL'" \
    || { tail -30 "$RUN_DIR/logs/web.log" >&2; die "web/proxy not ready; run: verify.sh down $RUN_ID"; }
  log "ready"
  cat <<EOF
RUN_ID=$RUN_ID
WEB_URL=$WEB_URL
API_URL=$API_URL
EVIDENCE_DIR=$EVIDENCE_DIR
EOF
}

cmd_doctor() {
  load_run "${1:-}"
  local ok=1
  check() { if "$@" >/dev/null 2>&1; then echo "ok   $DESC"; else echo "FAIL $DESC"; ok=0; fi; }
  # A port counts as ours only if its listener is in the process group we started (setsid → pgid = pid).
  owns() { local pid; pid="$(port_pid "$1")"; [[ -n "$pid" ]] && [[ "$(ps -o pgid= -p "$pid" | tr -d ' ')" == "$2" ]]; }

  echo "run $RUN_ID  web $WEB_URL  api $API_URL  pg 127.0.0.1:$PG_PORT"
  DESC="postgres container $PG_CONTAINER running"; check bash -c "[[ \$(docker inspect -f '{{.State.Running}}' $PG_CONTAINER) == true ]]"
  DESC="api process $API_PID alive";  check alive "$API_PID"
  DESC="web process $WEB_PID alive";  check alive "$WEB_PID"
  DESC="port $API_PORT owned by this run's api"; check owns "$API_PORT" "$API_PID"
  DESC="port $WEB_PORT owned by this run's vite"; check owns "$WEB_PORT" "$WEB_PID"
  DESC="api /healthz db ok";          check bash -c "curl -fsS $API_URL/healthz | grep -q '\"db\":\"ok\"'"
  DESC="web proxies /api/me as $DEV_EMAIL"; check bash -c "curl -fsS -H 'X-Acting-User: $DANI_ID' $WEB_URL/api/me | grep -q '$DEV_EMAIL'"
  if [[ "$(worktree_fingerprint)" == "$FINGERPRINT" ]]; then
    echo "ok   api/shared code unchanged since up"
  else
    echo "WARN api/shared code changed since up: the api does not reload; run down + up to verify the new code"
  fi
  ((ok)) || { echo "doctor: not healthy (logs in $RUN_DIR/logs)"; return 1; }
}

cmd_env() {
  load_run "${1:-}"
  grep -E '^(RUN_ID|RUN_DIR|WEB_URL|API_URL|PG_CONTAINER|EVIDENCE_DIR|DEV_EMAIL)=' "$RUN_DIR/run.env"
}

cmd_psql() {
  local run=""
  [[ $# -gt 0 && "$1" != -* ]] && { run="$1"; shift; }
  load_run "$run"
  docker exec -i "$PG_CONTAINER" psql -U family -d family -v ON_ERROR_STOP=1 "$@"
}

stop_group() { # <pid> <name>
  local pid="$1"
  alive "$pid" || return 0
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 10); do alive "$pid" || { log "stopped $2 ($pid)"; return 0; }; sleep 1; done
  kill -KILL -- "-$pid" 2>/dev/null || true
  log "killed $2 ($pid)"
}

cmd_down() {
  load_run "${1:-}"
  stop_group "${WEB_PID:-}" web
  stop_group "${API_PID:-}" api
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 && log "removed $PG_CONTAINER" || true
  rm -rf "$RUN_DIR/profile"
  touch "$RUN_DIR/down"
  log "evidence kept in $EVIDENCE_DIR"
}

cmd_list() {
  shopt -s nullglob
  for f in "$HOME_DIR"/*/run.env; do
    [[ "$f" == "$HOME_DIR/latest/run.env" ]] && continue
    ( source "$f"; s=down; [[ -e "$RUN_DIR/down" ]] || { alive "${API_PID:-}" && s=up || s=stale; }
      echo "$RUN_ID  $s  $WEB_URL  $(ls "$EVIDENCE_DIR" 2>/dev/null | wc -l) evidence dirs" )
  done
}

case "${1:-}" in
  up) shift; cmd_up "$@" ;;
  doctor) shift; cmd_doctor "$@" ;;
  env) shift; cmd_env "$@" ;;
  psql) shift; cmd_psql "$@" ;;
  down) shift; cmd_down "$@" ;;
  list) shift; cmd_list ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
