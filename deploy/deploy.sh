#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Tourny Lite — two-slot deployment operator
#
# One repo folder on the VM builds TWO containers, each from its own branch:
# a git worktree per slot serves as the docker build context, so the stable
# image is always exactly the stable branch and the dev image is exactly the
# dev branch — no checkout juggling, no re-copying the folder.
#
#   stable → tourny-stable → http://127.0.0.1:8090 (Cloudflare Tunnel → public)
#   dev    → tourny-dev    → http://127.0.0.1:8091 (localhost only)
#
# Branch per slot: deploy/deploy.env (committed defaults), overridden by
# deploy/deploy.local.env (gitignored, wins). Ports live in docker-compose.yml.
#
# First time on a new VM:   ./deploy/deploy.sh setup
# Daily use:                ./deploy/deploy.sh update [stable|dev|all]
# ------------------------------------------------------------------------------
set -euo pipefail

# ---------------------------------------------------------------- pretty output
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; RESET=''
fi
say()  { printf '%s\n' "${CYAN}[deploy]${RESET} $*"; }
ok()   { printf '%s\n' "${GREEN}[deploy]${RESET} $*"; }
note() { printf '%s\n' "${DIM}[deploy]${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}[deploy] WARN:${RESET} $*" >&2; }
die()  { printf '%s\n' "${RED}[deploy] ERROR:${RESET} $*" >&2; exit 1; }

# ---------------------------------------------------------------- locate the repo
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SELF_DIR")"
cd "$REPO_ROOT"

git rev-parse --git-dir >/dev/null 2>&1 \
  || die "$REPO_ROOT is not a git repository."

# If this copy is itself a linked worktree, resolve to its MAIN checkout —
# worktrees must only ever be created from the main one.
GIT_DIR_ABS="$(cd "$(git rev-parse --git-dir)" && pwd)"
GIT_COMMON_ABS="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
if [ "$GIT_DIR_ABS" != "$GIT_COMMON_ABS" ]; then
  REPO_ROOT="$(dirname "$GIT_COMMON_ABS")"
  cd "$REPO_ROOT"
  note "running from a linked worktree — operating on the main checkout: $REPO_ROOT"
fi
DEPLOY_DIR="$REPO_ROOT/deploy"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

# ---------------------------------------------------------------- configuration
# Defaults → deploy/deploy.env (committed) → deploy/deploy.local.env (wins).
STABLE_BRANCH="${STABLE_BRANCH:-main}"
DEV_BRANCH="${DEV_BRANCH:-feature/student-rankings}"
# shellcheck source=/dev/null
[ -f "$DEPLOY_DIR/deploy.env" ] && . "$DEPLOY_DIR/deploy.env"
# shellcheck source=/dev/null
[ -f "$DEPLOY_DIR/deploy.local.env" ] && . "$DEPLOY_DIR/deploy.local.env"

# ---------------------------------------------------------------- slot helpers
# NOTE: ports are defined in docker-compose.yml — keep in sync.
slot_branch()    { case "$1" in stable) echo "$STABLE_BRANCH";; dev) echo "$DEV_BRANCH";; *) die "unknown slot '$1'";; esac; }
slot_worktree()  { echo "$DEPLOY_DIR/worktrees/$1"; }
slot_data()      { echo "$DEPLOY_DIR/data-$1"; }
slot_envfile()   { echo "$DEPLOY_DIR/env/$1.env"; }
slot_container() { echo "tourny-$1"; }
slot_port()      { case "$1" in stable) echo 8090;; dev) echo 8091;; esac; }

expand_slots() {
  case "$1" in
    all) echo "stable dev" ;;
    stable|dev) echo "$1" ;;
    *) die "unknown slot '$1' — expected stable, dev or all" ;;
  esac
}

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

require_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "docker CLI not found — install docker (with the compose plugin) first."
  [ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 -v /dev/urandom | tr -d ' \n'
  fi
}

# One runtime env file per slot (holds AUTH_SECRET). Generated once, never
# overwritten — regenerating would invalidate every signed-in session.
ensure_env_file() {
  local slot="$1" f
  f="$(slot_envfile "$slot")"
  [ -f "$f" ] && return 0
  mkdir -p "$DEPLOY_DIR/env"
  {
    echo "# Tourny Lite — '$slot' slot runtime environment (generated, gitignored)."
    echo "# Keep AUTH_SECRET stable across restarts or everyone must sign in again."
    echo "AUTH_SECRET=$(generate_secret)"
    echo
    echo "# Optional headless WhatsApp fallback (normally configured in Settings):"
    echo "# WAHA_BASE_URL=https://wa-api.example.app"
    echo "# WAHA_API_KEY=..."
  } > "$f"
  chmod 600 "$f"
  say "$slot: generated session secret → $f"
}

# Prefer the freshest pushed state (origin/<branch>); fall back to the local
# branch when the VM is offline or has no push credentials.
resolve_ref() {
  local branch="$1"
  if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    echo "refs/remotes/origin/$branch"
  elif git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "refs/heads/$branch"
  else
    die "branch '$branch' not found (no origin/$branch, no local branch).
Configured branches: STABLE_BRANCH=$STABLE_BRANCH  DEV_BRANCH=$DEV_BRANCH
Available here:
$(git branch -a --format='  %(refname:short)' | sort -u)
Edit deploy/deploy.env (or deploy.local.env) to pick another branch."
  fi
}

worktree_registered() {
  git worktree list --porcelain | grep -q "^worktree $1$"
}

# Make deploy/worktrees/<slot> an exact, pristine checkout of the slot's
# branch — this directory is the docker build context for that slot.
sync_slot() {
  local slot="$1" branch ref wt old new
  branch="$(slot_branch "$slot")"
  ref="$(resolve_ref "$branch")"
  wt="$(slot_worktree "$slot")"
  git worktree prune
  if [ -d "$wt" ]; then
    if ! worktree_registered "$wt"; then
      die "leftover directory $wt is not a registered git worktree.
Fix: rm -rf \"$wt\"   then re-run this command."
    fi
    old="$(git -C "$wt" rev-parse --short HEAD)"
    git -C "$wt" reset --hard --quiet "$ref"
    git -C "$wt" clean -fdxq
    new="$(git -C "$wt" rev-parse --short HEAD)"
    if [ "$old" != "$new" ]; then
      say "$slot: $old → $new  ${DIM}($(git -C "$wt" log -1 --format=%s))${RESET}"
    else
      note "$slot: already at $new  ($(git -C "$wt" log -1 --format=%s))"
    fi
  else
    mkdir -p "$(dirname "$wt")"
    git worktree add --detach --quiet "$wt" "$ref"
    new="$(git -C "$wt" rev-parse --short HEAD)"
    say "$slot: worktree created at $new  ${DIM}($(git -C "$wt" log -1 --format=%s))${RESET}"
  fi
  [ -f "$wt/deploy/Dockerfile" ] \
    || die "$slot worktree ($branch @ $new) has no deploy/Dockerfile — that branch predates the container build. Pick a newer branch."
}

fetch_origin() {
  if [ "${SKIP_FETCH:-0}" = "1" ]; then
    note "skipping fetch (SKIP_FETCH=1) — using refs already in this copy"
    return 0
  fi
  note "fetching origin…"
  if command -v timeout >/dev/null 2>&1; then
    if ! timeout 60 git fetch --prune origin; then
      warn "git fetch failed (offline / no credentials) — continuing with refs already in this copy."
    fi
  else
    if ! git fetch --prune origin; then
      warn "git fetch failed (offline / no credentials) — continuing with refs already in this copy."
    fi
  fi
}

# Checkpoint the slot's SQLite WAL so a plain file copy is consistent.
checkpoint_slot() {
  local slot="$1" ctr
  ctr="$(slot_container "$slot")"
  if docker ps --filter "name=^${ctr}\$" --format '{{.Names}}' 2>/dev/null | grep -q .; then
    note "$slot: checkpointing SQLite WAL in $ctr…"
    docker exec -w /app "$ctr" node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);').then(async r=>{console.log('WAL checkpointed');await p.\$disconnect()}).catch(e=>{console.error(e.message);process.exit(1)})" \
      || warn "WAL checkpoint failed — copying the files as-is (WAL sidecar included)."
  else
    note "$slot: container not running — copying files as-is."
  fi
}

# A foreign container already publishing a slot's host port would make
# `compose up` fail halfway (one slot up, the other dead). Detect it BEFORE
# building anything and name the culprit.
port_squatter() { # slot -> first foreign container publishing its host port
  local port own
  port="$(slot_port "$1")"
  own="$(slot_container "$1")"
  # `|| true`: an empty result is the healthy case — without it, grep's
  # non-match status would silently kill the script under `set -e pipefail`.
  docker ps --filter "publish=$port" --format '{{.Names}}' 2>/dev/null \
    | grep -v -x "$own" | head -1 || true
}

# Extra remediation when the squatter is the retired experimental build
# (docker-compose.experimental.yml ran on 8091 with container tourny-lite-exp).
exp_hint() {
  case "$1" in
    tourny-lite-exp*|*experimental*)
      printf '%s\n' "" \
        "'$1' looks like the retired EXPERIMENTAL build — the dev slot replaces it" \
        "(same branch and port, plus its own session cookie). Its database lives in" \
        "deploy/data-experimental; to carry it onto the dev slot:" \
        "  docker compose -f deploy/docker-compose.yml stop dev" \
        "  rm -rf deploy/data-dev && mv deploy/data-experimental deploy/data-dev" \
        "then:  docker rm -f '$1'  and re-run this command."
      ;;
  esac
}

check_slot_ports() { # slots... — die early if a foreign container holds a slot port
  local slot squatter
  for slot in "$@"; do
    squatter="$(port_squatter "$slot")"
    [ -z "$squatter" ] && continue
    die "port $(slot_port "$slot") is already published by container '$squatter' — the '$slot' slot cannot start.
Free it first:  docker rm -f '$squatter'$(exp_hint "$squatter")"
  done
}

# ---------------------------------------------------------------- commands
cmd_setup() {
  require_docker
  say "Tourny Lite two-slot setup — one repo, two branches, two containers:"
  printf '  %-8s %s → http://127.0.0.1:%s\n' "stable" "$STABLE_BRANCH" "$(slot_port stable)"
  printf '  %-8s %s → http://127.0.0.1:%s\n' "dev" "$DEV_BRANCH" "$(slot_port dev)"
  echo

  # Migration hint for the old single-container deployment.
  if [ -d "$DEPLOY_DIR/data" ] && [ ! -d "$(slot_data stable)" ]; then
    warn "found deploy/data from the old single-container setup.
To keep that data on the stable slot, stop and move it first:
  docker rm -f tourny-lite 2>/dev/null || true
  mv deploy/data deploy/data-stable"
  fi
  if docker ps -a --filter 'name=^tourny-lite$' --format '{{.Names}}' 2>/dev/null | grep -q .; then
    warn "the old container 'tourny-lite' still exists — remove it after migrating:
  docker rm -f tourny-lite"
  fi

  # Leftovers from the retired experimental build (docker-compose.experimental.yml).
  if docker ps -a --filter 'name=^tourny-lite-exp' --format '{{.Names}}' 2>/dev/null | grep -q .; then
    warn "an old EXPERIMENTAL build container still exists — the dev slot replaces it:
  docker rm -f tourny-lite-exp"
  fi
  if [ -d "$DEPLOY_DIR/data-experimental" ] && [ ! -d "$(slot_data dev)" ]; then
    warn "found deploy/data-experimental (the old experimental build's database).
To carry it onto the dev slot:
  mv deploy/data-experimental deploy/data-dev"
  fi

  # Fail fast if a foreign container (e.g. the experimental build) already
  # publishes a slot port — before spending minutes building images.
  check_slot_ports stable dev

  fetch_origin
  local slot
  for slot in stable dev; do
    ensure_env_file "$slot"
    sync_slot "$slot"
  done

  say "building both images (first build takes a few minutes)…"
  compose build
  compose up -d

  echo
  ok "setup complete."
  echo "  ${BOLD}stable${RESET}  $(git -C "$(slot_worktree stable)" log -1 --format='%h %s')"
  echo "      → http://127.0.0.1:8090   (wire the tunnel to this port)"
  echo "  ${BOLD}dev${RESET}     $(git -C "$(slot_worktree dev)" log -1 --format='%h %s')"
  echo "      → http://127.0.0.1:8091   (localhost only — or: ssh -L 8091:127.0.0.1:8091 <vm>)"
  echo
  note "daily use:  ./deploy/deploy.sh update          (rebuild both slots)"
  note "            ./deploy/deploy.sh update stable   (rebuild stable only)"
  note "            ./deploy/deploy.sh status          (what runs where)"
  note "data:       deploy/data-stable/  deploy/data-dev/  (independent SQLite volumes)"
}

cmd_update() {
  require_docker
  local slots slot
  slots="$(expand_slots "${1:-all}")"
  check_slot_ports $slots
  fetch_origin
  for slot in $slots; do
    ensure_env_file "$slot"
    sync_slot "$slot"
    say "$slot: building image…"
    compose build "$slot"
    say "$slot: restarting container…"
    compose up -d "$slot"
  done
}

cmd_up() {
  require_docker
  local slots slot
  slots="$(expand_slots "${1:-all}")"
  check_slot_ports $slots
  for slot in $slots; do
    ensure_env_file "$slot"
    [ -d "$(slot_worktree "$slot")" ] || sync_slot "$slot"
  done
  compose up -d $slots
}

# `compose down` accepts service names only in newer compose versions;
# stop+rm works everywhere.
cmd_down() {
  require_docker
  local slots slot
  slots="$(expand_slots "${1:-all}")"
  if [ "$slots" = "stable dev" ]; then
    compose down
  else
    for slot in $slots; do
      compose stop "$slot"
      compose rm -f "$slot"
    done
  fi
  note "volumes (deploy/data-*) are kept — data survives."
}

cmd_restart() {
  require_docker
  local slots
  slots="$(expand_slots "${1:-all}")"
  compose restart $slots
}

cmd_logs() {
  require_docker
  local slot="${1:-all}"
  if [ "$slot" = "all" ]; then
    compose logs -f --tail=100
  else
    compose logs -f --tail=100 "$(expand_slots "$slot")"
  fi
}

cmd_status() {
  require_docker
  local slot branch wt_line img ctr data
  echo "${BOLD}Tourny Lite — deployment status${RESET}"
  for slot in stable dev; do
    branch="$(slot_branch "$slot")"
    if [ -d "$(slot_worktree "$slot")" ]; then
      wt_line="$(git -C "$(slot_worktree "$slot")" log -1 --format='%h %s')"
    else
      wt_line="worktree not created (run: ./deploy/deploy.sh update $slot)"
    fi
    img="$(docker image inspect "tourny-lite:$slot" --format '{{.Created}}' 2>/dev/null || echo 'not built')"
    ctr="$(docker ps -a --filter "name=^$(slot_container "$slot")\$" --format '{{.Status}}' 2>/dev/null | head -1)"
    [ -n "$ctr" ] || ctr="not created"
    if [ -d "$(slot_data "$slot")" ]; then
      data="$(du -sh "$(slot_data "$slot")" 2>/dev/null | cut -f1)"
    else
      data="empty"
    fi
    printf '  %s%s%s  branch %s\n' "${BOLD}" "$slot" "${RESET}" "$branch"
    printf '    worktree:  %s\n' "$wt_line"
    printf '    image:     tourny-lite:%s (%s)\n' "$slot" "$img"
    printf '    container: %s — %s\n' "$(slot_container "$slot")" "$ctr"
    printf '    data:      deploy/data-%s (%s)\n' "$slot" "$data"
    printf '    url:       http://127.0.0.1:%s\n' "$(slot_port "$slot")"
  done
}

cmd_backup() {
  require_docker
  local slot="${1:-stable}" data ts out
  case "$slot" in
    stable|dev) ;;
    *) die "backup takes a single slot: stable or dev" ;;
  esac
  data="$(slot_data "$slot")"
  [ -d "$data" ] || die "no data for '$slot' yet ($data) — nothing to back up."
  checkpoint_slot "$slot"
  mkdir -p "$DEPLOY_DIR/backups"
  ts="$(date +%Y%m%d-%H%M%S)"
  out="$DEPLOY_DIR/backups/${slot}-${ts}.tar.gz"
  tar czf "$out" -C "$data" .
  ok "saved $out ($(du -h "$out" | cut -f1))"
  ls -1t "$DEPLOY_DIR/backups/${slot}-"*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
  note "keeping the 10 newest '$slot' backups."
}

# Copy the stable database onto the dev slot (try new code against real data).
cmd_clone_db() {
  require_docker
  local assume_yes=0
  [ "${1:-}" = "--yes" ] && assume_yes=1
  local src dst
  src="$(slot_data stable)"
  dst="$(slot_data dev)"
  [ -d "$src" ] || die "no stable data yet ($src) — nothing to clone."

  if [ "$assume_yes" != "1" ]; then
    [ -t 0 ] || die "non-interactive shell — confirm with: ./deploy/deploy.sh clone-db --yes"
    warn "this REPLACES everything on the dev slot's database with stable's data."
    printf 'Type %syes%s to continue: ' "${BOLD}" "${RESET}"
    local reply
    read -r reply
    [ "$reply" = "yes" ] || die "aborted."
  fi

  compose stop dev >/dev/null 2>&1 || true
  checkpoint_slot stable
  mkdir -p "$dst"
  find "$dst" -mindepth 1 -delete
  cp -a "$src/." "$dst/"
  say "cloned stable → dev ($(du -sh "$dst" | cut -f1))."
  compose up -d dev
  note "dev now runs on a copy of the stable database."
}

cmd_prune() {
  require_docker
  say "removing dangling images from rebuilds…"
  docker image prune -f
  note "also useful: docker builder prune -f   (clear build cache, if disk is tight)"
}

cmd_help() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo
  echo "commands:"
  echo "  setup                   first time: worktrees + secrets + build + start"
  echo "  update  [stable|dev|all]  fetch origin, sync worktree, rebuild, restart"
  echo "  up      [stable|dev|all]  start containers (no rebuild)"
  echo "  down    [stable|dev|all]  stop containers (data is kept)"
  echo "  restart [stable|dev|all]  restart containers"
  echo "  logs    [stable|dev]      follow logs (default: both)"
  echo "  status                  what commit / image / container / data per slot"
  echo "  ps                      compose ps"
  echo "  backup  [stable|dev]    tar.gz of a slot's SQLite volume (keeps last 10)"
  echo "  clone-db [--yes]        copy stable's database onto the dev slot"
  echo "  prune                   remove dangling images from rebuilds"
  echo
  echo "environment:"
  echo "  SKIP_FETCH=1            update without contacting origin"
  echo "  STABLE_BRANCH / DEV_BRANCH  override for one run (deploy.env sets defaults)"
}

# ---------------------------------------------------------------- dispatch
cmd="${1:-help}"
[ "$#" -gt 0 ] && shift || true
case "$cmd" in
  setup)      cmd_setup "$@" ;;
  update)     cmd_update "${1:-all}" ;;
  up)         cmd_up "${1:-all}" ;;
  down)       cmd_down "${1:-all}" ;;
  restart)    cmd_restart "${1:-all}" ;;
  logs)       cmd_logs "${1:-}" ;;
  status)     cmd_status "$@" ;;
  ps)         require_docker; compose ps ;;
  backup)     cmd_backup "${1:-stable}" ;;
  clone-db)   cmd_clone_db "$@" ;;
  prune)      cmd_prune "$@" ;;
  help|-h|--help) cmd_help ;;
  *) die "unknown command '$cmd' — try: ./deploy/deploy.sh help" ;;
esac
