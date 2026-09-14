/**
 * Thin IO wrapper for the Triage Issue workflow (.github/workflows/triage.yml).
 *
 * All decisions live in @ai-eval/agent (unit-tested); this file only moves
 * bytes: issue payload -> production API -> gh CLI writes.
 *
 * Failure semantics: any error here exits non-zero, which fails the Actions
 * job and files nothing — a wrong-but-plausible comment on a real issue is
 * worse than a red workflow run (see docs/PIPELINE.md).
 *
 * Env: REPO, TRIAGE_URL, GH_TOKEN, ISSUE_JSON (github.event.issue as JSON).
 */
import { execFileSync } from "node:child_process";
import {
  alreadyTrialed,
  formatTriageComment,
  type IssuePayload,
  issueToTriageRequest,
  selectLabels,
} from "@ai-eval/agent";
import type { TriageResult } from "@ai-eval/shared";

const { REPO, TRIAGE_URL, ISSUE_JSON } = process.env;
if (!REPO || !TRIAGE_URL || !ISSUE_JSON) {
  throw new Error("REPO, TRIAGE_URL and ISSUE_JSON are required");
}
const issue = JSON.parse(ISSUE_JSON) as IssuePayload;

function gh(args: string[], input?: string): string {
  return execFileSync("gh", [...args, "--repo", REPO], {
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
}

// Idempotency: re-runs (workflow retries, manual dispatch of the same issue)
// must not double-post. 100 recent comments is ample for this check.
const comments = JSON.parse(
  gh(["api", `repos/${REPO}/issues/${issue.number}/comments?per_page=100`]),
) as Array<{ body?: string | null }>;
if (alreadyTrialed(comments)) {
  console.log(`#${issue.number}: already triaged — skipping (marker found)`);
  process.exit(0);
}

const payload = issueToTriageRequest(issue);
console.log(`triaging #${issue.number} via ${TRIAGE_URL}`);
const res = await fetch(`${TRIAGE_URL}/api/triage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(60_000),
});
if (!res.ok) {
  throw new Error(`agent returned ${res.status}: ${(await res.text()).slice(0, 400)}`);
}
const data = (await res.json()) as {
  model: string;
  latencyMs: number;
  result: TriageResult;
};
const { result } = data;
console.log(`verdict: ${result.category}/${result.severity} — ${result.summary}`);

// Whitelist boundary: labels must pre-exist in the repo. See selectLabels().
const vocabulary = JSON.parse(gh([`api`, `repos/${REPO}/labels?per_page=100`])) as Array<{
  name: string;
}>;
const labels = selectLabels(
  result,
  vocabulary.map((l) => l.name),
);
if (labels.length > 0) {
  gh(["issue", "edit", String(issue.number), "--add-label", labels.join(",")]);
  console.log(`applied labels: ${labels.join(", ")}`);
}

gh(
  ["issue", "comment", String(issue.number), "--body-file", "-"],
  formatTriageComment(result, { model: data.model, latencyMs: data.latencyMs }),
);
console.log(`#${issue.number}: triage comment posted`);
