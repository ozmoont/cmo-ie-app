#!/usr/bin/env bash
# ── Push .env.local → Vercel (production) ──
# One-shot helper to avoid clicking through Vercel's UI for each env
# var. Reads a .env file, removes each key from the target environment
# if present, then adds it fresh. Safe to re-run.
#
# Usage:
#   scripts/push-env-to-vercel.sh [envfile] [target]
#   scripts/push-env-to-vercel.sh                       # .env.local → production
#   scripts/push-env-to-vercel.sh .env.local preview    # .env.local → preview
#
# Prereqs — the script checks these and nudges you if missing:
#   1. npm install -g vercel   (one time)
#   2. vercel login            (one time, opens browser)
#   3. vercel link             (one time, pick the cmo-ie-app project)
#
# After the script finishes: trigger a fresh deploy so NEXT_PUBLIC_*
# values are baked into the new client bundle:
#   vercel --prod --force
#
# Then verify by hitting /api/health — every key you pushed should
# flip to "present: true".

set -euo pipefail

ENVFILE="${1:-.env.local}"
TARGET="${2:-production}"

# ── Pre-flight checks ────────────────────────────────────────────
if [[ ! -f "$ENVFILE" ]]; then
  echo "ERROR: $ENVFILE not found. Run from the project root." >&2
  exit 1
fi

# Resolve the `vercel` binary. Prefer a globally installed one if
# present; fall back to `npx vercel` so the script works on machines
# where `npm install -g` hit permission issues (common on macOS when
# /usr/local is root-owned).
if command -v vercel >/dev/null 2>&1; then
  VERCEL_CMD=(vercel)
else
  echo "  (no global vercel — using 'npx vercel')"
  VERCEL_CMD=(npx --yes vercel)
fi

# `vercel link` writes .vercel/project.json. Without it, `vercel env`
# doesn't know which project to target. Bail loud rather than push to
# the wrong account.
if [[ ! -f .vercel/project.json ]]; then
  echo "Project not linked. Run: vercel link" >&2
  echo "  Then pick the cmo-ie-app project when prompted." >&2
  exit 1
fi

echo "Pushing $ENVFILE → Vercel ($TARGET)"
echo "──────────────────────────────────────────────"

added=0
skipped=0

# ── Walk the file ────────────────────────────────────────────────
# The `|| [[ -n "$line" ]]` dance ensures we process a final line
# that has no trailing newline. IFS='=' with two variables puts
# everything after the FIRST = into $value, which is what we want
# (values can contain = themselves, e.g. base64).
while IFS='=' read -r key value || [[ -n "${key:-}" ]]; do
  # Skip comments and blank lines.
  [[ -z "${key// }" ]] && continue
  [[ "$key" =~ ^[[:space:]]*# ]] && continue

  # Trim whitespace from the key — some editors leave stray spaces.
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"

  if [[ -z "${value:-}" ]]; then
    echo "  ⊘ $key (empty, skipped)"
    skipped=$((skipped + 1))
    continue
  fi

  # Strip surrounding quotes on the value. Some .env conventions
  # quote everything; Vercel stores the raw string so we unwrap.
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"

  echo "  → $key"

  # Remove the existing row (if any) so `add` doesn't complain about
  # a duplicate. `--yes` skips the confirmation prompt. 2>/dev/null
  # hides the "not found" noise when the key isn't already set.
  "${VERCEL_CMD[@]}" env rm "$key" "$TARGET" --yes >/dev/null 2>&1 || true

  # `vercel env add` reads the value from stdin. `printf '%s'`
  # avoids trailing newlines that `echo` adds (which would make the
  # value 1 char longer than the .env.local source).
  printf '%s' "$value" | "${VERCEL_CMD[@]}" env add "$key" "$TARGET" >/dev/null

  added=$((added + 1))
done < "$ENVFILE"

echo "──────────────────────────────────────────────"
echo "Added/updated: $added"
echo "Skipped:       $skipped"
echo ""
echo "Next step — trigger a fresh build so NEXT_PUBLIC_* vars bake"
echo "into the new client bundle (cached builds keep the old values):"
echo ""
echo "    vercel --prod --force"
echo ""
echo "Then verify at: https://cmo-ie-app.vercel.app/api/health"
