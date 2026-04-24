#!/usr/bin/env bash
# ── Safer Stripe env setup ──
# Two-step flow that eliminates the terminal-paste footgun:
#
#   Run 1: creates .env.stripe.tmp with six blank fields, opens it in
#          TextEdit. You fill in the values (no hidden prompts, no
#          shell execution of your paste), save, close.
#
#   Run 2: reads the tmp file, validates each value's prefix
#          (sk_*, pk_*, whsec_*, price_*), merges into .env.local,
#          deletes the tmp, pushes to Vercel, redeploys.
#
# If any value fails the prefix check, the script exits WITHOUT
# touching .env.local. You fix the tmp and re-run.
#
# Works for both test and live mode — `sk_test_` and `sk_live_` both
# start with `sk_`, so the validator accepts either.

set -euo pipefail

TMP=".env.stripe.tmp"
ENVFILE=".env.local"

if [[ ! -f "$ENVFILE" ]]; then
  echo "ERROR: $ENVFILE not found. Run from the project root." >&2
  exit 1
fi

# Detect sed flavour (BSD vs GNU).
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i "")
fi

# ── Step 1: create template + open if tmp doesn't exist ─────────
if [[ ! -f "$TMP" ]]; then
  cat > "$TMP" << 'EOF'
# Fill in each value after the = sign, SAVE, close the editor,
# then re-run the script. Lines starting with # are comments.
#
# Test mode:  sk_test_... / pk_test_...
# Live mode:  sk_live_... / pk_live_...
# Either works — the script accepts both.
#
# Where to find each value in Stripe Dashboard:
#   STRIPE_SECRET_KEY                   Developers > API keys > Secret key (Reveal)
#   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  Developers > API keys > Publishable key
#   STRIPE_WEBHOOK_SECRET               Developers > Webhooks > your endpoint > Signing secret
#   NEXT_PUBLIC_STRIPE_PRICE_STARTER    Products > Starter > Pricing row (price_... chip)
#   NEXT_PUBLIC_STRIPE_PRICE_PRO        Products > Pro > same
#   NEXT_PUBLIC_STRIPE_PRICE_ADVANCED   Products > Advanced > same

STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PRICE_STARTER=
NEXT_PUBLIC_STRIPE_PRICE_PRO=
NEXT_PUBLIC_STRIPE_PRICE_ADVANCED=
EOF
  echo "Created $TMP"
  echo ""
  echo "Opening in TextEdit now. Fill in each value after the = sign,"
  echo "save the file (⌘S), close TextEdit, then re-run:"
  echo ""
  echo "    ./scripts/apply-stripe-env.sh"
  echo ""
  if command -v open >/dev/null 2>&1; then
    open -a TextEdit "$TMP" 2>/dev/null || true
  fi
  exit 0
fi

# ── Step 2: tmp exists, read + validate + merge ─────────────────
echo "Reading $TMP..."
echo ""

expected_prefix_for() {
  case "$1" in
    STRIPE_SECRET_KEY) echo "sk_" ;;
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) echo "pk_" ;;
    STRIPE_WEBHOOK_SECRET) echo "whsec_" ;;
    NEXT_PUBLIC_STRIPE_PRICE_STARTER) echo "price_" ;;
    NEXT_PUBLIC_STRIPE_PRICE_PRO) echo "price_" ;;
    NEXT_PUBLIC_STRIPE_PRICE_ADVANCED) echo "price_" ;;
    *) echo "" ;;
  esac
}

errors=0
accepted_count=0

# First pass: validate only. We refuse to touch .env.local if any
# single value is bad — partial writes are worse than no writes.
while IFS='=' read -r key value || [[ -n "${key:-}" ]]; do
  # Trim whitespace
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  [[ -z "$key" || "$key" =~ ^# ]] && continue

  expected=$(expected_prefix_for "$key")
  [[ -z "$expected" ]] && continue  # Unknown key, ignore

  # Strip surrounding quotes and whitespace from value
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#\"}"
  value="${value%\"}"

  if [[ -z "$value" ]]; then
    echo "  ✗ $key — empty"
    errors=$((errors + 1))
    continue
  fi

  # Prefix check. Rejects garbage like "cd ~/Pro" or "git push".
  if [[ "$value" != ${expected}* ]]; then
    echo "  ✗ $key — value starts with '${value:0:12}...', expected '${expected}'"
    errors=$((errors + 1))
    continue
  fi

  echo "  ✓ $key (${#value} chars, starts ${value:0:10}...)"
  accepted_count=$((accepted_count + 1))
done < "$TMP"

echo ""

if [[ $errors -gt 0 ]]; then
  echo "⚠  $errors issue(s). Fix $TMP and re-run. .env.local untouched."
  exit 1
fi

if [[ $accepted_count -eq 0 ]]; then
  echo "⚠  No Stripe values found in $TMP. Edit it, save, re-run."
  exit 1
fi

# Second pass: merge into .env.local. Safe now — validation already passed.
echo "Merging $accepted_count values into $ENVFILE..."
while IFS='=' read -r key value || [[ -n "${key:-}" ]]; do
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  expected=$(expected_prefix_for "$key")
  [[ -z "$expected" ]] && continue

  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#\"}"
  value="${value%\"}"

  # Escape | for the sed delimiter.
  escaped=$(printf '%s' "$value" | sed -e 's/[\\|]/\\&/g')

  if grep -q "^${key}=" "$ENVFILE"; then
    sed "${SED_INPLACE[@]}" -E "s|^${key}=.*|${key}=${escaped}|" "$ENVFILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENVFILE"
  fi
done < "$TMP"
echo "  ✓ $ENVFILE updated"

# Delete the tmp file — values are now in .env.local, don't leave
# secrets lying around.
rm "$TMP"
echo "  ✓ Deleted $TMP (values now in $ENVFILE)"

echo ""
echo "──────────────────────────────────────────────"
echo "Pushing $ENVFILE → Vercel production"
echo "──────────────────────────────────────────────"
./scripts/push-env-to-vercel.sh

echo ""
echo "──────────────────────────────────────────────"
echo "Triggering fresh production deploy"
echo "──────────────────────────────────────────────"
npx vercel --prod --force

echo ""
echo "Done. Verify at: https://cmo-ie-app.vercel.app/api/health"
