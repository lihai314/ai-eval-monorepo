## What

<!-- One paragraph: what does this PR change? Link the issue with `Fixes #N` or `Refs #N`. -->

## How to verify

- [ ] `pnpm install --frozen-lockfile && pnpm test && pnpm build` passes locally
- [ ] CI green: Lint / Unit / API / Build
- [ ] Behavior checked on the Vercel preview URL (if UI or API changed)

## Pipeline impact

- [ ] Touches agent prompts or model config (note: Agent Evaluation gate lands here in P3)
- [ ] Requires new/changed env vars (add to Vercel project settings + `.env.example`)

## Risk & rollback

<!-- Biggest risk of this change; how to revert if smoke fails. -->
