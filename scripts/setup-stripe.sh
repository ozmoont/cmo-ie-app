#!/usr/bin/env bash
# ── Interactive Stripe setup helper ──
# Prompts for each Stripe env var, writes them into .env.local, pushes
# to Vercel, and triggers a fresh production deploy. One-shot replacement
# for "open .env.local, edit six lines, run two commands".
#
# Usage:
#   scripts/setup-stripe.sh
#
# Each prompt hides the value while you type (treat them like passwords).
# Press Enter on an empty prompt to skip that variable (leaves whatever
# is currently in .env.local untouched).
#
# Safe to re-run if you need to rotate a key: just paste the new value
# on the one prompt you care about, skip the others.

set -euo pipefail

ENVFILE=".env.local"

if [[ ! -f "$ENVFILE" ]]; then
  echo "ERROR: $ENVFILE not found. Run from the project root." >&2
  exit 1
fi

# Detect sed flavour. macOS ships BSD sed which needs an empty-string
# argument to -i; GNU sed (Linux) doesn't. Getting this wrong either
# corrupts the file or errors out.
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i "")
fi

# ── Helpers ──────────────────────────────────────────────────────
# Replace the value after KEY= in .env.local. Idempotent: if the key
# doesn't exist yet, appends a new line. The sed escape handles values
# containing "|" (we use "|" as the s/// delimiter so URLs with "/"
# don't need escaping).
set_env_var() {
  local key="$1"
  local value="$2"

  # Escape backslashes and pipes in the value for the sed pattern.
  local escaped
  escaped=$(printf '%s' "$value" | sed -e 's/[\\|]/\\&/g')

  if grep -q "^${key}=" "$ENVFILE"; then
    sed "${SED_INPLACE[@]}" -E "s|^${key}=.*|${key}=${escaped}|" "$ENVFILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENVFILE"
  fi
}

# Prompt for a secret, hide typing, skip on empty.
prompt_for() {
  local key="$1"
  local label="$2"
  local expected_prefix="$3"

  echo ""
  echo "── $label ──"
  echo "    (expected to start with '$expected_prefix'; press Enter to skip)"
  read -r -s -p "  $key: " value
  echo ""

  if [[ -z "${value// }" ]]; then
    echo "    · skipped"
    return
  fi

  # Soft check on prefix — warn but accept. Lets you override if Stripe
  # ever changes their prefix conventions.
  if [[ ! "$value" =~ ^${expected_prefix} ]]; then
    echo "    ⚠  value doesn't start with '$expected_prefix' — continuing anyway"
  fi

  set_env_var "$key" "$value"
  echo "    ✓ updated $ENVFILE"
}

# ── Run ──────────────────────────────────────────────────────────
echo "Stripe setup — we'll update six env vars, push them to Vercel,"
echo "then trigger a fresh production deploy."
echo ""
echo "You'll need these open:"
echo "  1. Stripe Dashboard → Developers → API keys        (two keys)"
echo "  2. Stripe Dashboard → Developers → Webhooks → your endpoint  (signing secret)"
echo "  3. Stripe Dashboard → each Product → Pricing       (three price IDs)"
echo ""
read -r -p "Ready? [Y/n] " confirm
if [[ "$confirm" =~ ^[nN] ]]; then
  echo "Aborted."
  exit 0
fi

prompt_for "STRIPE_SECRET_KEY" "Secret API key (server-only)"        "sk_live_"
prompt_for "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "Publishable API key" "pk_live_"
prompt_for "STRIPE_WEBHOOK_SECRET" "Webhook signing secret"          "whsec_"
prompt_for "NEXT_PUBLIC_STRIPE_PRICE_STARTER" "Starter price ID"     "price_"
prompt_for "NEXT_PUBLIC_STRIPE_PRICE_PRO" "Pro price ID"             "price_"
prompt_for "NEXT_PUBLIC_STRIPE_PRICE_ADVANCED" "Advanced price ID"   "price_"

echo ""
echo "──────────────────────────────────────────────"
echo "Pushing $ENVFILE → Vercel production"
echo "──────────────────────────────────────────────"
./scripts/push-env-to-vercel.sh

echo ""
echo "──────────────────────────────────────────────"
echo "Triggering fresh production deploy (--force skips build cache,"
echo "so NEXT_PUBLIC_* values rebake into the client bundle)"
echo "──────────────────────────────────────────────"
npx vercel --prod --force

echo ""
echo "──────────────────────────────────────────────"
echo "Done. Verify at:"
echo "  https://cmo-ie-app.vercel.app/api/health"
echo ""
echo "All six Stripe keys should show 'present: true'. Paste the JSON"
echo "response back if anything looks off."
