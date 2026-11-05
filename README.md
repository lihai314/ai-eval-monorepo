# ai-eval-monorepo — eval-hub

**Agent evaluation platform with a visual ops console**: datasets → runs → per-item verdicts,
executed by a queue-triggered Python worker (Render, httpx + DeepEval) against any SUT —
starting with this repo's own issue-triage agent (dogfooding: every auto-triaged issue is
potential eval data). Built *on* the full delivery chain
**Issue → Branch → PR → CI(5 gates) → Merge → Staging → Smoke → Release → Production → Watchdog**,
with everything-as-code: schema, services, auth config and drift proofs all live in this repo.

📖 **Usage guide (login, running evals, troubleshooting): [docs/USAGE.md](docs/USAGE.md)** ·
Architecture & phases: [PLAN.md](PLAN.md) · Pipeline stages: [docs/PIPELINE.md](docs/PIPELINE.md)

## Repo layout

```
apps/web          Next.js app — UI + /api/{health,triage,datasets,eval-runs,corrections} (Vercel)
packages/shared   zod schemas & contracts (API ⇄ agent ⇄ eval all speak this)
packages/agent    triage agent: prompt, LLM client seam, strict output validation
packages/db       SQL layer: datasets, runs (pgmq fan-out), corrections
workers/eval      Python eval worker (Render, pull-pattern /drain) — see workers/eval/README.md
supabase/         config.toml + migrations/ + seeds/ — the control plane, as code
scripts/          smoke.mjs · auto-triage.mts · eval-gate.mts · drift/reconcile helpers
infra/            env manifests (Vercel/Render as code, verified by drift-check)
render.yaml       Blueprint definition for the eval worker (free web service)
.github/          workflows (ci / deploy-staging / release-production / triage / db-migrate / drain-eval) + templates
docs/PIPELINE.md  stage-by-stage map of the pipeline
docs/USAGE.md     end-user guide (Chinese): login, runs, watchdog, troubleshooting
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
cp .env.example .env.local   # mock LLM works with no key; PG_DSN unlocks the data plane
pnpm dev              # apps/web on http://localhost:3000
pnpm lint             # biome check
pnpm test             # turbo run test (unit + api)
pnpm build            # turbo run build
pnpm smoke            # BASE_URL=https://... node scripts/smoke.mjs
```

### Access control (secure by default)

- Console pages and **all read APIs** require a Supabase session (401 otherwise).
- `/api/triage` requires `Authorization: Bearer $TRIAGE_TOKEN` once the env var is set;
  `triage.yml` forwards `secrets.TRIAGE_TOKEN`.
- `/api/corrections` **fails closed**: without `CORRECTION_SECRET` it returns 503.
- The worker's `/drain` **fails closed** without `WORKER_TOKEN`.
- `/api/health` reports `triageAuth` and `workerWired` so both knobs are observable.
- The BFF wakes `/drain` right after enqueueing only when `WORKER_URL` + `EVAL_WORKER_TOKEN`
  are set (declared in `infra/vercel-env-manifest.json`); the 30-min cron is the backstop.
- One-time activation: `gh secret set TRIAGE_TOKEN` + reconcile Vercel env
  (`admin-vercel-env.yml`) so the token is provisioned on both sides.

## Delivery pipeline (one screen)

| Stage | Where it lives | Trigger |
| --- | --- | --- |
| Issue | `.github/ISSUE_TEMPLATE/` | human (agent now auto-classifies new issues: `triage.yml` → production `/api/triage`) |
| Branch | `feat/<name>-<issue>` / `fix/<name>-<issue>` | human |
| PR | `gh pr create` → checks + Vercel preview | human |
| CI | `.github/workflows/ci.yml`: lint ∥ unit ∥ api → build | PR + push main |
| Merge | squash-merge into protected `main` | after CI green |
| Eval Gate | `.github/workflows/eval-gate.yml` | PR touching agent/** is scored against triage-zh-v1 in-process |
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
