# Pipeline Reference

The chain this repo is built to teach. Every stage lists: **what runs it**, **what passing means**,
and **the lesson it teaches** for agent development.

```
GitHub Issue → Branch → Pull Request → CI (lint ∥ unit ∥ api → build) → Merge
→ main → Staging Deploy → Smoke → Release → Production → Monitoring
```

## Stage by stage

### Issue
- **Runs it**: humans today via `.github/ISSUE_TEMPLATE/` (bug / feature).
- **Passing means**: work has a number to reference; `Fixes #N` closes it.
- **Lesson**: issues are the agent's raw dataset — batch 2 "Automatic Issue" closes the loop
  (monitoring failure → auto-filed issue → agent triages it → its own dogfood dataset).

### Branch
- **Convention**: `feat/<name>-<issue#>` / `fix/<name>-<issue#>` off `main`.
- **Lesson**: naming is machine-parseable context — later automation infers issue links from it.

### Pull Request
- **Runs it**: `gh pr create`. Vercel (once Git integration is enabled) adds a preview deploy
  as a free extra pre-merge environment.
- **Passing means**: PR template filled (verify steps + pipeline impact + rollback plan).
- **Lesson**: the "Pipeline impact" checkbox on *touches prompts/models* is the hook where the
  future Agent Evaluation gate will hang.

### CI — `.github/workflows/ci.yml`
- **Runs it**: every PR and every push to `main`.
- **Shape**: `lint & typecheck` ∥ `unit (packages/*)` ∥ `api (web route handlers)` → `build`.
- **Passing means**: all four jobs green; `main` is protected to require them.
- **Lesson**: API tests import route handlers directly (no server, no network) — agent code stays
  a pure function of (input, LlmClient), which is exactly what makes batch-2 evals cheap to run.

### Merge → main
- **Runs it**: squash merge; `main` is the deploy source of truth.
- **Lesson**: one trunk, one source of truth → any deployed artifact maps to exactly one commit.

### Staging Deploy — `.github/workflows/deploy-staging.yml`
- **Runs it**: auto on push to `main`; `vercel deploy --prod` into `ai-eval-staging`
  (cloud build via root `vercel.json`; `GIT_SHA` baked into the bundle).
- **Lesson**: deploy must carry identity — the build reports which commit it *is*.

### Smoke — `scripts/smoke.mjs`
- **Runs it**: immediately after staging deploy, inside the same workflow.
- **Passing means**: `/api/health` returns `status: ok` **and** `gitSha == released SHA`
  (catches "deployed, but served a stale build").
- **Lesson**: a smoke gate is a *version assertion*, not a ping.

### Release — `workflow_dispatch` on `release-production.yml`
- **Runs it**: human click (`gh workflow run Release\ Production`). Bound to the `production`
  GitHub environment; add required reviewers there to make it an approval gate.
- **Passing means**: dispatch accepted with the SHA that passed staging.
- **Lesson**: production is never automatic in a learning loop — blast radius control first.

### Production
- **Runs it**: same workflow, deploying to `ai-eval-production`, followed by post-release smoke.
- **Lesson**: prod = staging + 1 (identical artifact, different project/env vars).

### Monitoring
- **Now**: `/api/health` identity reporting + smoke evidence in every workflow run summary.
- **Next (P4)**: Sentry (errors), Langfuse (LLM traces/scores), daily cron smoke (also keeps the
  free Supabase project awake).
- **Lesson**: monitoring is the input to batch-2 Automatic Rollback and Automatic Issue.

## Failure playbook

| Symptom | Where | First move |
| --- | --- | --- |
| PR checks red | CI | `gh pr checks <n>` → failing job log |
| Staging deploy fails | Actions | check `VERCEL_TOKEN`/project IDs secrets; read workflow log |
| Smoke FAIL (version mismatch) | Actions | usually stale build → re-run deploy job; else rollback |
| Prod regression | Monitoring | redeploy previous main commit: `git revert` → fast PR → Release |

Useful commands:

```bash
gh run list --workflow "Deploy Staging" --limit 5   # pipeline history
gh run watch                                          # tail the current run
gh workflow run "Release Production"                  # the Release button from the CLI
node scripts/smoke.mjs                                # BASE_URL=... GIT_SHA=... locally
```

## Batch 2 backlog (stubbed, in build order)

1. **Agent Evaluation** — `packages/eval` dataset + graders; extra CI job that runs when
   `packages/agent/**/prompt*` or model config changes; gate on regression vs baseline.
2. **Trace** — Langfuse wrapper around `LlmClient` (the seam in `packages/agent/src/llm.ts`
   was designed for exactly this: one interface, full observability).
3. **Automatic Issue** — on smoke/monitor failure, open an issue with run context
   (`gh issue create` from a workflow).
4. **Nightly Regression** — cron → eval suite + smoke; trend written to Supabase.
5. **Queue Monitoring** — when triage moves behind a queue (Vercel cron/Blob or Supabase queue):
   depth + oldest-job-age on `/api/health`.
6. **Automatic Rollback** — post-deploy smoke failure → redeploy last-known-good production
   artifact, then trigger Automatic Issue (#3). The version assertion in today's smoke test is
   what makes this safe to automate.
