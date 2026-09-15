#!/usr/bin/env bash
# One-time (idempotent) Supabase Auth configuration via the Management API —
# Auth-as-code companion to setup-vercel.sh.
#
# Requires: SUPABASE_ACCESS_TOKEN (dashboard → Account → Tokens, or extracted
# from the CLI's stored credentials).
# Optional: GH_OAUTH_CLIENT_ID + GH_OAUTH_SECRET — when present, enables the
# GitHub OAuth provider too (the OAuth App itself must be created on GitHub;
# callback URL: https://<project-ref>.supabase.co/auth/v1/callback).
#
# Usage: SUPABASE_ACCESS_TOKEN=... ./scripts/setup-supabase-auth.sh
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-snxliarypkeuzvecjnfy}"
TOKEN="${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}"
API="https://api.supabase.com/v1/projects/${REF}/config/auth"
AUTH_HDR="Authorization: Bearer ${TOKEN}"

PROD_URL="https://ai-eval-production-lihai314.vercel.app"
STAG_URL="https://ai-eval-staging-lihai314.vercel.app"

echo "==> site url + redirect allow-list + email magic link"
curl -sf -X PATCH "$API" -H "$AUTH_HDR" -H 'content-type: application/json' -d "{
  \"site_url\": \"${PROD_URL}\",
  \"uri_allow_list\": \"${PROD_URL},${STAG_URL},http://localhost:3000\",
  \"external_email_enabled\": true,
  \"mailer_mailpath\": \"/auth/callback\",
  \"security_manual_linking_enabled\": false
}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("   site_url="+j.site_url+" email="+j.external_email_enabled)})'

if [ -n "${GH_OAUTH_CLIENT_ID:-}" ] && [ -n "${GH_OAUTH_SECRET:-}" ]; then
  echo "==> enabling GitHub OAuth provider"
  curl -sf -X PATCH "$API" -H "$AUTH_HDR" -H 'content-type: application/json' -d "{
    \"external_github_client_id\": \"${GH_OAUTH_CLIENT_ID}\",
    \"external_github_secret\": \"${GH_OAUTH_SECRET}\",
    \"external_github_enabled\": true
  }" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("   github="+j.external_github_enabled)})'
else
  echo "==> GH_OAUTH_CLIENT_ID/GH_OAUTH_SECRET not set — GitHub provider left as-is"
  echo "    (create a GitHub OAuth App with callback https://${REF}.supabase.co/auth/v1/callback,"
  echo "     then re-run with the two env vars)"
fi
echo "done."
