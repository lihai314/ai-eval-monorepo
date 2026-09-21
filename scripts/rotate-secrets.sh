#!/usr/bin/env bash
# Full secret rotation runbook — "GitHub is the single source of truth".
# Collects/regenerates every secret, writes it to GitHub via `gh secret set`
# (values NEVER touch git or this file), then re-dispatches the admin
# workflows so Vercel + Render converge on the new values.
#
# Run from repo root with gh authenticated. Per-secret prompts; Enter skips.
#
# Usage: ./scripts/rotate-secrets.sh
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required (brew install gh)" >&2
  exit 1
fi
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login" >&2; exit 1; }

RED=$'\033[0;31m'
GRN=$'\033[0;32m'
YEL=$'\033[0;33m'
NC=$'\033[0m'

set_secret() { # name value — one-way write, never echoed back
  printf '%s' "$2" | gh secret set "$1"
  echo -e "${GRN}✔  $1 updated${NC}"
}

prompt_secret() { # name "where to regenerate"
  local name="$1" hint="$2" val=""
  echo -e "${YEL}== $name${NC}"
  echo "   regenerate: $hint"
  read -rsp '   paste new value (hidden; Enter to skip): ' val
  echo
  if [ -z "$val" ]; then echo -e "${YEL}   skipped${NC}"; return; fi
  set_secret "$name" "$val"
}

echo "=== A. Auto-generated secrets (local random) ==="
echo -e "${YEL}== CORRECTION_SECRET${NC}  (webhook auth for /api/corrections)"
set_secret CORRECTION_SECRET "$(openssl rand -hex 24)"
echo -e "${YEL}== EVAL_WORKER_TOKEN${NC}  (worker /drain auth == Render WORKER_TOKEN; rotate together)"
set_secret EVAL_WORKER_TOKEN "$(openssl rand -hex 24)"

echo
echo "=== B. Regenerate at source, paste here ==="
prompt_secret JEV_API_KEY "https://jev-ai.pro → API keys"
prompt_secret OPENAI_API_KEY "Volcengine/Ark console → API key"
prompt_secret SUPABASE_ACCESS_TOKEN "Supabase → Account → Access Tokens"
prompt_secret RENDER_API_KEY "Render → Account Settings → API Keys"
prompt_secret VERCEL_TOKEN "Vercel → Settings → Tokens (STAGING project-scoped token)"
prompt_secret VERCEL_TOKEN_PROD "Vercel → Settings → Tokens (PRODUCTION project-scoped token)"

echo
echo -e "${RED}== SUPABASE_DB_URL (read before pasting) ==${NC}"
echo "   Rotating the Supabase DB password invalidates EVERY old DSN."
echo "   1) Supabase → Project Settings → Database → Reset DB password"
echo "   2) paste the NEW session-pooler URI:"
echo "      postgresql://postgres.<ref>:<NEW_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
read -rsp '   paste new DSN (hidden; Enter to skip): ' db
echo
if [ -n "$db" ]; then
  set_secret SUPABASE_DB_URL "$db"
  echo -e "${GRN}   ✔ PG_DSN on Vercel + Render both source from SUPABASE_DB_URL — no manual step.${NC}"
fi

echo
echo -e "${GRN}=== GitHub secrets updated. Redistributing to platforms... ===${NC}"
read -rp '   run admin workflows now? [y/N] ' yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
  gh workflow run admin-vercel-env.yml --ref main
  gh workflow run admin-render-env.yml --ref main
  echo "dispatched. Watch both runs: every key should log HTTP 200."
fi
echo
echo "Verify: worker $(curl -s https://eval-worker.onrender.com/healthz | jq -r '.mode') mode"
echo "        staging $(curl -s https://ai-eval-staging-lihai314.vercel.app/api/health | jq -r '.llmMode') llmMode"
