## What

<!-- One paragraph: what does this PR change? Link the issue with `Fixes #N` or `Refs #N`. -->

## How to verify

- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes locally
- [ ] CI green — all five required contexts on `main`: `Lint & Typecheck`, `Unit Tests (packages)`, `API Tests (web)`, `Worker Tests (Python)`, `Build`
- [ ] Python worker: `cd workers/eval && uv run --extra test pytest -q`
- [ ] Results belong to the latest head SHA (CI cancels superseded runs via `cancel-in-progress`)
- [ ] Behavior checked on the Vercel preview URL (if UI or API changed)

## Pipeline impact

- [ ] Touches agent prompts or model config (note: Agent Evaluation gate lands here in P3)
- [ ] Requires new/changed env vars (add to Vercel project settings + `.env.example`)

## Risk & rollback

<!-- Biggest risk of this change; how to revert if smoke fails. -->
