#!/bin/sh
# docs/testing.md → "Основното правило": an act step in a spec is a call that must happen.
# A standalone `x?.run();` is a silent no-op when `x` is missing, so the spec stays green.
# Teardown (`?.close()`) is allowed.
# Usage: check-spec-optional-call.sh [repo root, default .]
set -eu

root=${1:-.}
found=$(find "$root/apps" "$root/packages" -path '*/node_modules' -prune -o \( -name '*.spec.ts' -o -name '*.spec.tsx' \) -print \
  | xargs grep -HnE '^\s*(await\s+)?[A-Za-z_$][A-Za-z0-9_$.]*\?\.[A-Za-z_$][A-Za-z0-9_$]*\(.*\);\s*$' \
  | grep -vE '\?\.close\(\)' || true)

if [ -n "$found" ]; then
  echo "::error::optional call as a spec statement; assert the target exists first (docs/testing.md)"
  printf '%s\n' "$found"
  exit 1
fi
