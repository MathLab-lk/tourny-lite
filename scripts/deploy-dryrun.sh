#!/usr/bin/env bash
# End-to-end dry-run of deploy/deploy.sh against a fresh "VM" clone served by
# a local bare origin, using the stub docker CLI (scripts/stub/docker). Real
# git operations; docker/compose are simulated and logged.
#
# Usage: bash scripts/deploy-dryrun.sh
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY="${TMPDIR:-/tmp}/tourny-deploy-dryrun"
STUBBIN="$REPO/scripts/stub"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }
section() { echo; echo "== $1 =="; }

rm -rf "$DRY"; mkdir -p "$DRY"
export STUB_DOCKER_LOG="$DRY/docker.log"; : > "$STUB_DOCKER_LOG"
export PATH="$STUBBIN:$PATH"
export GIT_AUTHOR_NAME="dryrun" GIT_AUTHOR_EMAIL="dryrun@tourny.test"
export GIT_COMMITTER_NAME="dryrun" GIT_COMMITTER_EMAIL="dryrun@tourny.test"

# ---------------------------------------------------------------- fake origin
git init --bare -q --initial-branch=main "$DRY/origin.git"
# The sandbox checkout may have no local `main` — push from the remote ref.
git -C "$REPO" push -q "$DRY/origin.git" origin/main:refs/heads/main HEAD:refs/heads/feature/student-rankings \
  || { echo "ABORT: push to fake origin failed"; exit 1; }
git clone -q "$DRY/origin.git" "$DRY/vm"
DEV_BRANCH_NAME="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
git -C "$DRY/vm" checkout -q "$DEV_BRANCH_NAME"
[ -f "$DRY/vm/deploy/deploy.sh" ] || { echo "ABORT: clone is missing deploy/deploy.sh"; exit 1; }
STABLE_SHA="$(git -C "$DRY/vm" rev-parse --short origin/main)"
DEV_SHA="$(git -C "$DRY/vm" rev-parse --short "origin/$DEV_BRANCH_NAME")"
cd "$DRY/vm"
D=./deploy/deploy.sh

run() { # expected-exit description cmd...
  local want_="$1" desc="$2"; shift 2
  local out rc
  out=$("$@" 2>&1); rc=$?
  LAST_OUT="$out"
  if [ "$rc" -eq "$want_" ]; then ok "$desc (exit=$rc)"
  else bad "$desc — expected exit $want_, got $rc"; printf '%s\n' "$out" | sed 's/^/      | /'; fi
}
log_has() { if grep -q -- "$1" "$STUB_DOCKER_LOG"; then ok "log: $2"; else bad "log missing: $2"; fi; }
log_not_has() { if grep -q -- "$1" "$STUB_DOCKER_LOG"; then bad "log unexpectedly has: $2"; else ok "log not: $2"; fi; }
out_has() { if printf '%s' "$LAST_OUT" | grep -q -- "$1"; then ok "out: $2"; else bad "out missing: $2"; printf '%s\n' "$LAST_OUT" | sed 's/^/      | /' | head -8; fi; }

# ---------------------------------------------------------------- help & usage
section "help / argument errors"
run 0 "help" $D help
out_has "commands:" "help lists commands"
run 1 "unknown command" $D frobnicate
out_has "unknown command" "unknown command message"
run 1 "unknown slot" $D update staging
out_has "unknown slot" "unknown slot message"

# ---------------------------------------------------------------- setup
section "setup (fresh VM)"
run 0 "setup" $D setup
out_has "feature/student-rankings" "setup announces the dev branch"
out_has "setup complete" "setup completes"
[ -d deploy/worktrees/stable ] && ok "stable worktree exists" || bad "stable worktree missing"
[ -d deploy/worktrees/dev ] && ok "dev worktree exists" || bad "dev worktree missing"
[ "$(git -C deploy/worktrees/stable rev-parse --short HEAD)" = "$STABLE_SHA" ] \
  && ok "stable worktree at origin/main ($STABLE_SHA)" || bad "stable worktree at wrong commit"
[ "$(git -C deploy/worktrees/dev rev-parse --short HEAD)" = "$DEV_SHA" ] \
  && ok "dev worktree at origin/$DEV_BRANCH_NAME ($DEV_SHA)" || bad "dev worktree at wrong commit"
[ -f deploy/worktrees/stable/deploy/Dockerfile ] && ok "stable worktree has Dockerfile" || bad "stable worktree lacks Dockerfile"
[ -f deploy/worktrees/dev/deploy/Dockerfile ] && ok "dev worktree has Dockerfile" || bad "dev worktree lacks Dockerfile"
for s in stable dev; do
  f="deploy/env/$s.env"
  if [ -f "$f" ]; then ok "$s env file exists"; else bad "$s env file missing"; continue; fi
  [ "$(stat -c %a "$f")" = "600" ] && ok "$s env file mode 600" || bad "$s env file mode $(stat -c %a "$f")"
  grep -qE '^AUTH_SECRET=[0-9a-f]{64}$' "$f" && ok "$s env has 64-hex AUTH_SECRET" || bad "$s AUTH_SECRET malformed"
done
log_has "compose -f $DRY/vm/deploy/docker-compose.yml build" "compose build (both)"
log_has "compose -f $DRY/vm/deploy/docker-compose.yml up -d" "compose up -d"
[ -z "$(git status --porcelain)" ] && ok "VM checkout stays clean (runtime state ignored)" \
  || { bad "VM checkout dirty:"; git status --porcelain | sed 's/^/      | /'; }

# ---------------------------------------------------------------- status
section "status (containers running)"
STUB_PS_ECHO=1 run 0 "status" $D status
out_has "Up 2 hours (healthy)" "status shows running containers"
out_has "feature/student-rankings" "status shows dev branch"

# ---------------------------------------------------------------- update
section "update"
run 0 "update (both)" $D update
out_has "already at" "update reports no-op sync"
log_has "compose -f $DRY/vm/deploy/docker-compose.yml build stable" "rebuild stable"
log_has "compose -f $DRY/vm/deploy/docker-compose.yml build dev" "rebuild dev"
run 0 "update stable only" $D update stable
SKIP_FETCH=1 run 0 "SKIP_FETCH=1 update dev" $D update dev
out_has "skipping fetch" "SKIP_FETCH skips origin fetch"

# ---------------------------------------------------------------- backup
section "backup"
run 1 "backup stable with no data" $D backup stable
out_has "nothing to back up" "no-data backup refuses"
mkdir -p deploy/data-stable
printf 'fake-sqlite-%s' "$RANDOM" > deploy/data-stable/custom.db
echo stable-marker > deploy/data-stable/marker.txt
STUB_PS_ECHO=1 run 0 "backup stable" $D backup stable
out_has "WAL checkpointed" "backup checkpoints WAL via docker exec"
ls deploy/backups/stable-*.tar.gz >/dev/null 2>&1 && ok "backup tarball created" || bad "no backup tarball"
run 1 "backup with bad slot arg" $D backup both

# ---------------------------------------------------------------- clone-db
section "clone-db"
run 1 "clone-db non-interactive without --yes" $D clone-db
out_has "confirm with" "clone-db demands --yes non-interactively"
STUB_PS_ECHO=1 run 0 "clone-db --yes" $D clone-db --yes
out_has "WAL checkpointed" "clone-db checkpoints stable's WAL first"
[ -f deploy/data-dev/marker.txt ] && ok "stable data copied onto dev" || bad "dev data not cloned"
log_has "compose -f $DRY/vm/deploy/docker-compose.yml stop dev" "clone-db stops dev first"
STUB_PS_ECHO=1 run 0 "backup dev (data now exists)" $D backup dev

# ---------------------------------------------------------------- branch errors
section "branch / worktree errors"
DEV_BRANCH=no-such-branch run 1 "update dev with bad DEV_BRANCH" $D update dev
out_has "branch 'no-such-branch' not found" "bad branch error names the branch"
out_has "feature/student-rankings" "bad branch error lists available branches"

# leftover (unregistered) worktree directory
git worktree remove --force deploy/worktrees/dev >/dev/null 2>&1
mkdir -p deploy/worktrees/dev
run 1 "update dev with leftover dir" $D update dev
out_has "not a registered git worktree" "leftover directory detected"
rm -rf deploy/worktrees/dev
run 0 "update dev after cleanup" $D update dev

# ---------------------------------------------------------------- port conflicts
section "port conflict pre-flight (retired experimental build on 8091)"
STUB_PORT_SQUATTER=8091 run 1 "update dev blocked by squatter" $D update dev
out_has "tourny-lite-exp" "error names the squatter"
out_has "data-experimental" "error explains the experimental data carry-over"
STUB_PORT_SQUATTER=8091 run 1 "up dev blocked" $D up dev
STUB_PORT_SQUATTER=8090:other-app run 1 "update stable blocked by generic squatter" $D update stable
out_has "other-app" "generic squatter is named too"
STUB_PORT_SQUATTER=8091 run 0 "update stable unaffected (8090 free)" $D update stable
: > "$STUB_DOCKER_LOG"
STUB_PORT_SQUATTER=8091 run 1 "setup blocked before building" $D setup
out_has "port 8091" "setup error names the port"
log_not_has "compose -f $DRY/vm/deploy/docker-compose.yml build" "no build attempted while blocked"

# leftover experimental state on an otherwise clean setup
mkdir -p deploy/data-experimental; echo x > deploy/data-experimental/custom.db
mv deploy/data-dev "$DRY/data-dev.parked"
STUB_EXP_CONTAINER=1 run 0 "setup with leftover experimental state" $D setup
out_has "docker rm -f tourny-lite-exp" "setup warns to retire the experimental container"
out_has "mv deploy/data-experimental deploy/data-dev" "setup warns how to carry experimental data"
mv "$DRY/data-dev.parked" deploy/data-dev
rm -rf deploy/data-experimental

# ---------------------------------------------------------------- from a worktree
section "running deploy.sh from inside a worktree"
WT_OUT="$DRY/worktree-status.out"
if ( cd deploy/worktrees/dev && ./deploy/deploy.sh status ) > "$WT_OUT" 2>&1; then
  ok "status from worktree (exit=0)"
else
  bad "status from worktree — non-zero exit"
fi
LAST_OUT="$(cat "$WT_OUT")"
out_has "operating on the main checkout" "self-resolves to main checkout"
printf '%s\n' "$LAST_OUT" | head -3 | sed 's/^/      | /'

# ---------------------------------------------------------------- prune & wrap
section "prune"
run 0 "prune" $D prune
log_has "image prune -f" "docker image prune ran"

echo
echo "== RESULT: $PASS passed, $FAIL failed =="
echo "scratch dir kept for inspection: $DRY"
[ "$FAIL" -eq 0 ] || exit 1
