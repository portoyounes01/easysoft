#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Push EasySoft edge-function secrets (Section 3 of .env) to Supabase in one go.
# Reads values from the repo-root .env — so a partner just drops in the shared
# .env and runs:   bash scripts/push-secrets.sh
#
# Note: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected into functions by
# Supabase automatically (reserved prefix) — we never push those.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo "ERROR: .env not found in repo root." >&2; exit 1; fi

# read a KEY=value from .env (value may contain '=' and '+', but no newlines)
get() { grep "^$1=" .env | head -1 | cut -d= -f2-; }

REF="$(get SUPABASE_PROJECT_REF)"
export SUPABASE_ACCESS_TOKEN="$(get SUPABASE_ACCESS_TOKEN)"

if [ -z "$REF" ]; then echo "ERROR: SUPABASE_PROJECT_REF missing in .env" >&2; exit 1; fi
echo "→ Pushing edge-function secrets to project: $REF"

supabase secrets set \
  ANTHROPIC_API_KEY="$(get ANTHROPIC_API_KEY)" \
  WHATSAPP_TOKEN="$(get WHATSAPP_TOKEN)" \
  WHATSAPP_PHONE_NUMBER_ID="$(get WHATSAPP_PHONE_NUMBER_ID)" \
  WHATSAPP_BUSINESS_NUMBER="$(get WHATSAPP_BUSINESS_NUMBER)" \
  WHATSAPP_APP_ID="$(get WHATSAPP_APP_ID)" \
  WHATSAPP_WABA_ID="$(get WHATSAPP_WABA_ID)" \
  WHATSAPP_APP_SECRET="$(get WHATSAPP_APP_SECRET)" \
  WHATSAPP_VERIFY_TOKEN="$(get WHATSAPP_VERIFY_TOKEN)" \
  SONIOX_API_KEY="$(get SONIOX_API_KEY)" \
  --project-ref "$REF"

echo "✓ Secrets pushed."
echo "→ Now deploy the functions:"
echo "    supabase functions deploy assistant whatsapp-webhook whatsapp-pair-code transcribe --project-ref $REF"
