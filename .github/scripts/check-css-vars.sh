#!/bin/sh
# Every `var(--x)` in apps/web/src must name a custom property that exists: declared as `--x:` in a
# stylesheet or set from code as the string '--x' (style props). Catches a renamed design token
# (e.g. `--radius` → `--radius-md`) that lint, typecheck, tests and build all let through silently.
# `var(--x, fallback)` is skipped: the fallback is the intended default. Names built at runtime
# (`var(--color-${token})`) are not matched.
# Usage: check-css-vars.sh [source dir, default apps/web/src]
set -eu

dir=${1:-apps/web/src}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

find "$dir" -name '*.css' -exec grep -hoE -- '--[A-Za-z0-9_-]+[[:space:]]*:' {} + |
  sed -E 's/[[:space:]]*:$//' >"$tmp/declared"
find "$dir" \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.spec.*' \
  -exec grep -hoE -- "['\"]--[A-Za-z0-9_-]+['\"]" {} + | tr -d "'\"" >>"$tmp/declared"
sort -u "$tmp/declared" -o "$tmp/declared"

find "$dir" \( -name '*.css' -o -name '*.ts' -o -name '*.tsx' \) ! -name '*.spec.*' \
  -exec grep -HnoE -- 'var\(--[A-Za-z0-9_-]+\)' {} + >"$tmp/used" || true

status=0
while IFS= read -r hit; do
  name=$(printf '%s' "$hit" | sed -E 's/.*var\((--[A-Za-z0-9_-]+)\)$/\1/')
  if ! grep -qxF -- "$name" "$tmp/declared"; then
    file=${hit%%:*}
    echo "::error file=$file::$name is not declared anywhere in $dir (renamed or removed token?)"
    printf '%s\n' "$hit"
    status=1
  fi
done <"$tmp/used"

exit "$status"
