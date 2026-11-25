# Pipeline Reference

The chain this repo is built to teach. Every stage lists: **what runs it**, **what passing means**,
and **the lesson it teaches** for agent development.

```
GitHub Issue → short-lived branch → Pull Request + CI + Preview → Merge to main
→ Staging Deploy → Smoke → Production Deploy → Monitoring
```

## Stage by stage

### Issue
- **Runs it**: humans via `.github/ISSUE_TEMPLATE/` (bug / feature); every new issue is then
  auto-classified by the production agent (`triage.yml` → `scripts/auto-triage.mts` →
  `TRIAGE_URL/api/triage` → comment + labels). Labels are applied from the repo whitelist only.
- **Passing means**: work has a number to reference; `Fixes #N` closes it; the agent's verdict
  lands on the issue within a minute.
- **Lesson**: agent output is untrusted input — the whitelist boundary in `selectLabels()` is the
  pattern to copy everywhere. Future "monitoring failure → auto-filed issue" reuses this loop.

### Branch
- **Convention**: create a short-lived `feat/<issue#>-<name>` / `fix/<issue#>-<name>` branch
  from the latest `main`; keep one focused change per branch. Do not maintain `develop`,
  `release/*`, or `hotfix/*` integration branches.
- **After merge**: delete the branch; start follow-up work from the updated `main`.
- **Lesson**: `main` stays releasable, while every change is integrated through a small PR.

### Pull Request
- **Runs it**: `gh pr create`; CI and the Vercel Git integration's preview deployment run before merge.
- **Passing means**: all five CI contexts and the separate required `PR Governance` context pass;
  all code conversations are resolved. Review is recommended but approval is not required while
  the repository has one direct collaborator. The governance check validates What, verification,
  risk/rollback, and an issue reference or `NO-ISSUE`.
- **Lesson**: the "Pipeline impact" checkbox documents prompt/model changes; the Eval Gate is
  triggered by its workflow path filters, not by the checkbox.

### CI — `.github/workflows/ci.yml`
- **Runs it**: every PR and every push to `main`.
- **Shape**: `lint & typecheck` ∥ `unit (packages/*)` ∥ `api (web route handlers)` ∥ `worker (Python)` → `build`.
- **Passing means**: all five CI contexts are green. Together with the separately required
  `PR Governance` context, `main` currently protects six required contexts.
- **Lesson**: API tests import route handlers directly (no server, no network) — agent code stays
  a pure function of (input, LlmClient), which is exactly what makes batch-2 evals cheap to run.

### Merge → main
- **Runs it**: squash-merge after required checks pass and code conversations are resolved; delete
  the short-lived branch. Review is recommended but not enforced with one direct collaborator.
- **Passing means**: `main` remains protected by six required contexts (five CI contexts plus
  `PR Governance`) and deployable; no release branch or manual release command is needed.
- **Lesson**: one trunk, one source of truth → every deployed artifact maps to exactly one commit.

### Staging Deploy — `.github/workflows/deploy-main.yml`
- **Runs it**: automatically on push to `main`; `vercel deploy --prod` into `ai-eval-staging`
  (cloud build via root `vercel.json`; `GIT_SHA` baked into the bundle).
- **Lesson**: deploy must carry identity — the build reports which commit it *is*.

### Smoke — `scripts/smoke.mjs`
- **Runs it**: immediately after staging deploy, inside the same workflow.
- **Passing means**: `/api/health` returns `status: ok` **and** `gitSha == deployed commit SHA`
  (catches "deployed, but served a stale build").
- **Lesson**: a smoke gate is a *version assertion*, not a ping.

### Production Deploy
- **Runs it**: the production job in `.github/workflows/deploy-main.yml` runs only after the
  staging deploy and exact-commit smoke test pass. It deploys the same `github.sha` to
  `ai-eval-production`, then runs a production smoke test.
- **Safeguard**: the `production` GitHub environment currently requires reviewer approval, so the
  production job pauses after staging smoke until that approval is granted.
- **Rollback**: open a PR that reverts the bad merge. Once merged, the revert follows this same
  staging → smoke → production path.

### Monitoring
- **Now**: `/api/health` identity reporting; staging/production post-deploy smoke; daily Drift
  Watchdog checks for deploy, worker, environment, and migration drift; 30-minute worker-drain cron.
- **Not wired yet**: Sentry, OpenTelemetry, and Langfuse tracing/score export.
- **Lesson**: monitoring is the input to batch-2 Automatic Rollback and Automatic Issue.

## Failure playbook

| Symptom | Where | First move |
| --- | --- | --- |
| PR checks red | CI | `gh pr checks <n>` → failing job log |
| Staging deploy fails | Actions | check `VERCEL_TOKEN`/project IDs secrets; read workflow log |
| Smoke FAIL (version mismatch) | Actions | usually stale build → re-run deploy job; else rollback |
| Prod regression | Monitoring | `git revert` → PR → merge; the revert automatically redeploys |

Useful commands:

```bash
gh run list --workflow "Deploy Main" --limit 5       # staging + production history
gh run watch                                          # tail the current run
node scripts/smoke.mjs                                # BASE_URL=... GIT_SHA=... locally
```

## Batch 2 backlog and status (in build order)

1. **Agent Evaluation — shipped** — `eval-gate.yml` runs against `triage-zh-v1` when
   `packages/agent/**`, `packages/shared/**`, or `scripts/eval-gate.mts` changes. Missing LLM key
   produces an explicit `SKIPPED` report. The workflow is not one of the six required branch
   protection contexts, so it is not currently a merge-blocking gate.
2. **Trace — not implemented** — add the Sentry/OTel/Langfuse integration around `LlmClient` and
   carry `run_id`/`item_id` across API, queue, worker, and SUT spans.
3. **Automatic Issue — partial** — the daily Drift Watchdog already files/deduplicates issues on
   detected deployment, worker, environment, or migration drift. Remaining: create an issue
   immediately for failed post-deploy smoke or drain/monitor runs, with the run context, then let
   the existing triage workflow classify it.
4. **Nightly Regression** — cron → eval suite + smoke; trend written to Supabase.
5. **Queue Monitoring** — when triage moves behind a queue (Vercel cron/Blob or Supabase queue):
   depth + oldest-job-age on `/api/health`.
6. **Automatic Rollback** — post-deploy smoke failure → redeploy last-known-good production
   artifact, then trigger Automatic Issue (#3). The version assertion in today's smoke test is
   what makes this safe to automate.
