#!/bin/sh
# docs/testing.md → "Какво е „публично“ тук": repositories are covered through the api routes
# (`app.inject()` against the test database), never by a spec of their own.
# Usage: check-spec-layout.sh [repo root, default .]
set -eu

root=${1:-.}
found=$(find "$root/apps/api/src/db/repositories" -name '*.spec.ts' 2>/dev/null || true)

if [ -n "$found" ]; then
  echo "::error::repository specs are not allowed; assert this behaviour through a route spec (docs/testing.md)"
  printf '%s\n' "$found"
  exit 1
fi
