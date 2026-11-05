#!/usr/bin/env node
/**
 * Smoke test: the gate between "deployed" and "releasable".
 *
 * Usage:
 *   BASE_URL=https://ai-eval-staging.vercel.app [GIT_SHA=abc123] node scripts/smoke.mjs
 *   BASE_URL=https://ai-eval-staging.vercel.app node scripts/smoke.mjs --json
 *
 * - Polls /api/health with exponential backoff (cold deploys can exceed 60s).
 * - If GIT_SHA is set, the deployed build must report that exact commit.
 * - --json emits exactly one JSON object on stdout so a nightly job can persist
 *   results without grepping human-readable text (#12). Progress logs are
 *   suppressed in that mode.
 * - Retry/timeout knobs (#11): SMOKE_ATTEMPTS, SMOKE_DELAY_MS,
 *   SMOKE_MAX_DELAY_MS, SMOKE_TIMEOUT_MS.
 */
const jsonOutput = process.argv.slice(2).includes("--json");
const baseUrl = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const expectedSha = process.env.GIT_SHA;
const maxAttempts = Number(process.env.SMOKE_ATTEMPTS ?? 20);
const baseDelayMs = Number(process.env.SMOKE_DELAY_MS ?? 3000);
const maxDelayMs = Number(process.env.SMOKE_MAX_DELAY_MS ?? 15000);
const probeTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 20000);

if (!baseUrl) {
  const error = "BASE_URL is required";
  if (jsonOutput) console.log(JSON.stringify({ ok: false, error }));
  else console.error(error);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const progress = (msg) => {
  if (!jsonOutput) console.warn(msg);
};

async function probe(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(probeTimeoutMs),
    redirect: "follow",
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function report(payload) {
  if (jsonOutput) {
    console.log(JSON.stringify(payload));
    return;
  }
  const line = payload.ok
    ? `[smoke] PASS ${payload.baseUrl} — ${payload.service}@${payload.gitSha} (branch ${payload.gitBranch}, llm ${payload.llmMode}, ${payload.attempts} attempt(s))`
    : `[smoke] FAIL ${payload.baseUrl} — ${payload.error}`;
  (payload.ok ? console.log : console.error)(line);
}

async function main() {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { status, body } = await probe(`${baseUrl}/api/health`);
      if (status === 200 && body?.status === "ok") {
        if (expectedSha && body.gitSha !== expectedSha) {
          lastError = `version mismatch: expected ${expectedSha}, got ${body.gitSha}`;
          progress(`[smoke] attempt ${attempt}: ${lastError}`);
        } else {
          report({
            ok: true,
            baseUrl,
            service: body.service,
            gitSha: body.gitSha,
            gitBranch: body.gitBranch,
            llmMode: body.llmMode,
            attempts: attempt,
            checkedAt: new Date().toISOString(),
          });
          return;
        }
      } else {
        lastError = `health returned ${status}`;
        progress(`[smoke] attempt ${attempt}: ${lastError}`);
      }
    } catch (err) {
      lastError = err.message;
      progress(`[smoke] attempt ${attempt}: ${lastError}`);
    }
    if (attempt < maxAttempts) {
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }
  report({
    ok: false,
    baseUrl,
    expectedSha: expectedSha ?? null,
    attempts: maxAttempts,
    error: lastError,
    checkedAt: new Date().toISOString(),
  });
  process.exit(1);
}

main();
