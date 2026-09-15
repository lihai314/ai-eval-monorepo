# ai-eval-monorepo — issue-pilot

Learning project: an agent app built *on* the full delivery chain —
**Issue → Branch → PR → CI → Merge → Staging → Smoke → Release → Production → Monitoring**.

The product itself is an **issue-triage agent**: `POST /api/triage` takes a GitHub issue and
returns a structured verdict (`category / severity / labels / summary`). No LLM key? The agent
falls back to a deterministic mock client, so the pipeline always runs end-to-end.

## Repo layout

```
apps/web          Next.js app — UI + /api/health + /api/triage (deployed on Vercel)
packages/shared   zod schemas & contracts (API ⇄ agent ⇄ eval all speak this)
packages/agent    triage agent: prompt, LLM client seam, strict output validation
workers/eval      Python eval worker (Render, pull-pattern /drain) — see workers/eval/README.md
supabase/         config.toml + migrations/ + seeds/ — the control plane, as code
scripts/          smoke.mjs · auto-triage.mts · setup-vercel.sh
render.yaml       Blueprint definition for the eval worker (free web service)
.github/          workflows (ci / deploy-staging / release-production / triage / db-migrate / drain-eval) + templates
docs/PIPELINE.md  stage-by-stage map of the pipeline (start here)
PLAN.md           product & architecture plan (v2.1)
```

## Everything-as-code principle

Every moving part is declared in this repo; the platforms just execute it:

| Surface | Code artifact | Reconciled by |
| --- | --- | --- |
| Schema | `supabase/migrations/*.sql` | `db-migrate.yml` → `supabase db push` on merge to main |
| Local stack | `supabase/config.toml` + `seeds/seed.sql` | `pnpm db:start` / `pnpm db:reset` (Docker) |
| TS types from schema | `pnpm db:types` | generated into `packages/shared` |
| Worker service | `render.yaml` (Blueprint) | Render Blueprint apply |
| Queue heartbeat | `.github/workflows/drain-eval.yml` | cron → `POST /drain` |
| Web app env | `scripts/setup-vercel.sh` | idempotent Vercel project config |

## Local development

```bash
pnpm install          # Node >= 20, pnpm 10
cp .env.example .env.local   # optional — mock LLM works with no key
pnpm dev              # apps/web on http://localhost:3000
pnpm lint             # biome check
pnpm test             # turbo run test (unit + api)
pnpm build            # turbo run build
pnpm smoke            # BASE_URL=https://... node scripts/smoke.mjs
```

## Delivery pipeline (one screen)

| Stage | Where it lives | Trigger |
| --- | --- | --- |
| Issue | `.github/ISSUE_TEMPLATE/` | human (agent now auto-classifies new issues: `triage.yml` → production `/api/triage`) |
| Branch | `feat/<name>-<issue>` / `fix/<name>-<issue>` | human |
| PR | `gh pr create` → checks + Vercel preview | human |
| CI | `.github/workflows/ci.yml`: lint ∥ unit ∥ api → build | PR + push main |
| Merge | squash-merge into protected `main` | after CI green |
| Staging Deploy | `.github/workflows/deploy-staging.yml` → Vercel `ai-eval-staging` | push main |
| Smoke | `scripts/smoke.mjs` (health + exact-commit check) | part of staging job |
| Release | `gh workflow run release-production.yml` + `production` environment gate | human |
| Production | same workflow → Vercel `ai-eval-production` | after Release |
| Monitoring | `/api/health` identity reporting; Sentry/Langfuse land in P4 | continuous |

Details, failure playbook, and what each stage teaches: **[docs/PIPELINE.md](docs/PIPELINE.md)**.

## One-time platform setup

1. **Vercel projects**: `vercel project add ai-eval-staging && vercel project add ai-eval-production`,
   then apply settings: `VERCEL_API_TOKEN=... ./scripts/setup-vercel.sh`
   (rootDirectory=apps/web, turbo build, SSO protection off for smoke access).
2. **GitHub repo secrets/vars** consumed by the workflows:
   - `VERCEL_TOKEN` (secret) — a `vcp_` **project** token from ai-eval-staging → Settings → Tokens
   - `VERCEL_TOKEN_PROD` (secret) — a second `vcp_` token from ai-eval-production → Settings → Tokens
     (project-scoped tokens can't deploy to the other project — learned the hard way in run 34855756577)
   - `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_STAGING`, `VERCEL_PROJECT_ID_PRODUCTION` (IDs, not sensitive)
3. **Branch protection** on `main`: require CI checks (Lint, Unit, API, Worker, Build) to pass before merge.
4. Optional hard gate: add required reviewers to the `production` **environment**
   (Settings → Environments → production), turning "Release" into an approval.
5. **Supabase project** (free tier, `supabase projects create` or dashboard):
   then set `SUPABASE_DB_URL` (session pooler connection string) as a repo secret —
   `db-migrate.yml` then auto-applies every merged migration; hand the pooler DSN to
   Render's `PG_DSN` secret and set the `SUPABASE_PROJECT_REF` repo variable.
6. **Render**: New → Blueprint → this repo. The Blueprint declares `WORKER_TOKEN`
   as `key + sync: false` (no value committed), so Render **prompts for it during
   creation** — paste the same bearer as the GHA secret `EVAL_WORKER_TOKEN`.
   Add `PG_DSN` in the dashboard once Supabase exists; when the service is live,
   set repo variable `WORKER_URL` → the drain cron arms itself.

## Roadmap

Batch 1 (this repo): pipeline skeleton ✅.
Batch 2 (next, tracked in docs/PIPELINE.md): Agent Evaluation gate · Queue Monitoring ·
Trace (Langfuse) · Automatic Rollback · Automatic Issue · Nightly Regression.
LLM provider is env-only (`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRIAGE_MODEL`) —
flip `llmMode` from `mock` to `live` without touching code.
