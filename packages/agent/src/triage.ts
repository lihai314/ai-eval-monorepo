import { type TriageRequest, type TriageResult, triageResultSchema } from "@ai-eval/shared";
import type { LlmClient } from "./llm";

export function buildTriagePrompt(req: TriageRequest): string {
  return [
    "You triage GitHub issues for a TypeScript monorepo about AI agents.",
    `Classify issue #${req.issueNumber}.`,
    `TITLE: ${req.title}`,
    `BODY: ${req.body.slice(0, 4000) || "(empty)"}`,
    "",
    'Respond with ONLY a JSON object: {"category": "bug|feature|docs|question|chore",',
    '"severity": "low|medium|high|critical", "labels": [1-6 short labels],',
    '"summary": one sentence under 280 chars}.',
  ].join("\n");
}

export class TriageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TriageParseError";
  }
}

/** Prompt -> LLM -> strict zod validation. Invalid model output is a hard error,
 *  never a silent fallback: this is the assertion the eval suite builds on. */
export async function triageIssue(req: TriageRequest, llm: LlmClient): Promise<TriageResult> {
  const raw = await llm.complete(buildTriagePrompt(req));
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new TriageParseError(`LLM response contained no JSON object: ${raw.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new TriageParseError(`LLM returned invalid JSON: ${jsonMatch[0].slice(0, 200)}`);
  }
  const result = triageResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new TriageParseError(`LLM output failed schema validation: ${result.error.message}`);
  }
  return result.data;
}
