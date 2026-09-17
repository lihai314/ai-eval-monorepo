/**
 * Eval gate runner: the PR's OWN prompt code, graded against triage-zh-v1.
 * In-process on purpose — production serves the LAST RELEASE, so HTTP-eval
 * would measure the wrong prompt (see #51).
 *
 * Usage: OPENAI_API_KEY=... SUPABASE_DB_URL=... pnpm tsx scripts/eval-gate.mts
 * Exits 1 when accuracy < GATE_MIN_SCORE (default 80).
 */

import { getLlmFromEnv, subsetMatch, triageIssue } from "@ai-eval/agent";
import { getSql } from "@ai-eval/db";

const DATASET = process.env.GATE_DATASET ?? "triage-zh-v1";
const MIN_SCORE = Number(process.env.GATE_MIN_SCORE ?? 80);

// --- dataset from Supabase ---
const sql = getSql();
const [ds] =
  await sql`select id, name from datasets where name = ${DATASET} order by version desc limit 1`;
if (!ds) throw new Error(`dataset not found: ${DATASET}`);
const items = await sql`
  select id, input, expected from dataset_items where dataset_id = ${ds.id} order by created_at`;

// --- SUT = the PR's own agent code, in-process (no HTTP, no deploy) ---
const llm = getLlmFromEnv(process.env);
console.log(
  `eval-gate: dataset=${DATASET} (${items.length} items) model=${llm.model} sut=in-process(packages/agent@HEAD)`,
);

const rows: Array<{ title: string; category: string; passed: boolean; reason: string }> = [];
for (const it of items) {
  const input = it.input as { issueNumber: number; title: string; body: string };
  const expected = (it.expected as Record<string, unknown>) ?? {};
  try {
    const startedAt = Date.now();
    const result = await triageIssue(
      { issueNumber: input.issueNumber, title: input.title, body: input.body ?? "" },
      llm,
    );
    // grade against the FULL agent response, exactly like the worker does
    const full = {
      issueNumber: input.issueNumber,
      model: llm.model,
      latencyMs: Date.now() - startedAt,
      result,
    };
    const graded = subsetMatch(expected, full);
    rows.push({
      title: input.title,
      category: result.category,
      passed: graded.ok,
      reason: graded.problems.join("; ").slice(0, 120),
    });
  } catch (err) {
    rows.push({
      title: input.title,
      category: "ERROR",
      passed: false,
      reason: String(err instanceof Error ? err.message : err).slice(0, 120),
    });
  }
}

const passed = rows.filter((r) => r.passed).length;
const score = Math.round((passed / rows.length) * 100);
console.log("REPORT");
for (const r of rows) {
  console.log(
    `${r.passed ? "PASS" : "FAIL"} | ${r.category.padEnd(8)} | ${r.title.slice(0, 40)} | ${r.reason}`,
  );
}
console.log(`SCORE: ${passed}/${rows.length} = ${score}% (threshold ${MIN_SCORE}%)`);
if (score < MIN_SCORE) process.exit(1);
