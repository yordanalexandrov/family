#!/bin/sh
# Guards AGENTS.md → Public repo on every PR (ci.yml): only deploy.yml may use the self-hosted
# runner on homesrv (labels self-hosted, family, homesrv); deploy.yml asks for it by the family
# label and never runs for a PR. It catches mistakes, not a hostile fork PR, which can edit this
# script as well: that is what approval of fork PR workflows is for (infra/README.md → GitHub).
# Usage: check-workflows.sh [workflows dir, default .github/workflows]
set -eu

dir=${1:-.github/workflows}
deploy=$dir/deploy.yml
status=0

# Lines of file $1 matching ERE $2 in any case (runner labels are case-insensitive), without comment lines.
hits() {
  grep -inE "$2" "$1" | grep -vE '^[0-9]+:[[:space:]]*#' || true
}

# report <file> <message> [matching lines]
report() {
  echo "::error file=$1::$2"
  [ -z "${3:-}" ] || printf '%s\n' "$3"
  status=1
}

for file in "$dir"/*.yml "$dir"/*.yaml; do
  [ -f "$file" ] && [ "$file" != "$deploy" ] || continue
  found=$(hits "$file" 'self-hosted|runs-on:.*(family|homesrv)')
  [ -z "$found" ] || report "$file" 'only deploy.yml may use the self-hosted runner (AGENTS.md → Public repo)' "$found"
done

if [ ! -f "$deploy" ]; then
  report "$deploy" 'deploy.yml is missing'
else
  # pull_request* runs the PR's code; workflow_run starts right after a PR's workflow.
  found=$(hits "$deploy" 'pull_request|workflow_run')
  [ -z "$found" ] || report "$deploy" 'deploy.yml runs only on push to master and workflow_dispatch' "$found"
  found=$(hits "$deploy" 'runs-on:.*family')
  [ -n "$found" ] || report "$deploy" 'runs-on of deploy.yml must contain the family label'
fi

exit "$status"
