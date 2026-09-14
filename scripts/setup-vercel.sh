#!/usr/bin/env bash
# One-time Vercel project configuration for the pipeline (idempotent).
#
# Why this exists: rootDirectory / ssoProtection cannot live in vercel.json
# once the project root differs from the deploy root, and a stale root
# vercel.json silently overrides project settings on every deploy.
#
# Usage:  VERCEL_API_TOKEN=vca_xxx ./scripts/setup-vercel.sh [project...]
set -euo pipefail

TOKEN="${VERCEL_API_TOKEN:?set VERCEL_API_TOKEN (a long-lived Vercel access token)}"
export VERCEL_API_TOKEN="$TOKEN"

PROJECTS=("${@:-ai-eval-staging ai-eval-production}")
BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT

for P in $PROJECTS; do
  echo "==> configuring $P"
  # rootDirectory: build from apps/web; the repo-root install/build stays turbo.
  printf '{"rootDirectory":"apps/web","buildCommand":"pnpm turbo build --filter=@ai-eval/web","outputDirectory":".next"}' >"$BODY"
  vercel api "/v9/projects/$P" -X PATCH --input "$BODY" >/dev/null
  # Smoke test needs unauthenticated access to /api/health.
  printf '{"ssoProtection":null}' >"$BODY"
  vercel api "/v9/projects/$P" -X PATCH --input "$BODY" >/dev/null
  vercel api "/v9/projects/$P" 2>/dev/null |
    node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(`  rootDirectory=${j.rootDirectory} outputDirectory=${j.outputDirectory} ssoProtection=${j.ssoProtection ?? "disabled"}`)})'
done
