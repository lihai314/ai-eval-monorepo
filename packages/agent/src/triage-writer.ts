import type { TriageRequest, TriageResult } from "@ai-eval/shared";

/** Raw GitHub issue shape (subset of the webhook payload we rely on). */
export interface IssuePayload {
  number: number;
  title: string;
  body?: string | null;
}

/** Marker embedded in the bot comment; presence means "already triaged".
 *  Keep the version suffix — bumping it intentionally re-runs triage. */
export const TRIAGE_MARKER = "<!-- issue-pilot-triage:v1 -->";

const BODY_LIMIT = 8000;
const MAX_APPLIED_LABELS = 6;

/** Issue → API contract. Null/undefined bodies normalize to "" and long
 *  bodies are truncated so one mega-issue can't blow up the prompt. */
export function issueToTriageRequest(issue: IssuePayload): TriageRequest {
  return {
    issueNumber: issue.number,
    title: issue.title,
    body: (issue.body ?? "").slice(0, BODY_LIMIT),
  };
}

/**
 * The safety boundary between model output and GitHub write permissions:
 * a label is applied *only if* it already exists in the repo vocabulary
 * (issue types + severity levels are pre-created). Model-authored strings can
 * never conjure new repo state — prompt injection's worst case here is a
 * wrong label chosen from a small fixed set.
 */
export function selectLabels(result: TriageResult, vocabulary: readonly string[]): string[] {
  const wanted = [result.category, `severity:${result.severity}`, ...result.labels];
  const vocab = new Set(vocabulary);
  const applied: string[] = [];
  for (const label of wanted) {
    if (vocab.has(label) && !applied.includes(label)) applied.push(label);
    if (applied.length >= MAX_APPLIED_LABELS) break;
  }
  return applied;
}

export function alreadyTrialed(comments: ReadonlyArray<{ body?: string | null }>): boolean {
  return comments.some((c) => typeof c.body === "string" && c.body.includes(TRIAGE_MARKER));
}

export interface CommentMeta {
  model: string;
  latencyMs: number;
}

export function formatTriageComment(result: TriageResult, meta: CommentMeta): string {
  return [
    "### 🤖 issue-pilot triage",
    "",
    `**category** \`${result.category}\` · **severity** \`${result.severity}\` · **model** \`${meta.model}\` · \`${meta.latencyMs}ms\``,
    "",
    `> ${result.summary}`,
    "",
    result.labels.length > 0
      ? `_proposed labels: ${result.labels.map((l) => `\`${l}\``).join(" ")}_`
      : "",
    "",
    "<sub>Applied automatically from the deployed build. Disagree? Change the labels — corrections are what the eval set learns from.</sub>",
    TRIAGE_MARKER,
  ]
    .filter(Boolean)
    .join("\n");
}
