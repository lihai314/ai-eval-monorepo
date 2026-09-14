#!/usr/bin/env node
/**
 * Smoke test: the gate between "deployed" and "releasable".
 *
 * Usage:  BASE_URL=https://ai-eval-staging.vercel.app [GIT_SHA=abc123] node scripts/smoke.mjs
 *
 * - Polls /api/health until it answers (cold deploys take a moment).
 * - If GIT_SHA is set, the deployed build must report that exact commit:
 *   this catches "deploy succeeded but served a stale build" failures.
 */
const baseUrl = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const expectedSha = process.env.GIT_SHA;
const maxAttempts = Number(process.env.SMOKE_ATTEMPTS ?? 12);
const delayMs = Number(process.env.SMOKE_DELAY_MS ?? 5000);

if (!baseUrl) {
  console.error("BASE_URL is required");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { status, body } = await probe(`${baseUrl}/api/health`);
      if (status === 200 && body?.status === "ok") {
        if (expectedSha && body.gitSha !== expectedSha) {
          lastError = `version mismatch: expected ${expectedSha}, got ${body.gitSha}`;
          console.warn(`[smoke] attempt ${attempt}: ${lastError}`);
        } else {
          console.log(
            `[smoke] PASS ${baseUrl} — ${body.service}@${body.gitSha} (branch ${body.gitBranch}, llm ${body.llmMode})`,
          );
          return;
        }
      } else {
        lastError = `health returned ${status}`;
        console.warn(`[smoke] attempt ${attempt}: ${lastError}`);
      }
    } catch (err) {
      lastError = err.message;
      console.warn(`[smoke] attempt ${attempt}: ${lastError}`);
    }
    await sleep(delayMs);
  }
  console.error(`[smoke] FAIL ${baseUrl} — ${lastError}`);
  process.exit(1);
}

main();
