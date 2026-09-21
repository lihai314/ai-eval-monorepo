/**
 * jev-ai System One client — a typed-question API. One request takes a
 * `state` (text or JSON) plus up to 64 typed questions (noul / choice /
 * score) and returns one structured answer per question with confidence.
 * It is a classifier/extractor, not a chat model: use it for labelling,
 * routing and cheap pre-filter judging — never for generation (there is no
 * free-text answer type, so no rationale/reason output either).
 *
 * Protocol mirrors TypeSafe's System One; docs at https://jev-ai.pro/jev-api
 * (base URL defaults to https://jev-ai.pro/api; endpoints under it are
 * /v1/systemone, /v1/credits, /v1/models — Bearer auth). #62
 */

import { z } from "zod";

export type JevQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevQuestions = Record<string, JevQuestion>;

/** noul -> probability of "yes" (0..1); choice -> the chosen criteria key;
 *  score -> a continuous value on the criteria scale. */
export type JevAnswers = Record<string, number | string>;

export interface JevOptions {
  apiKey: string;
  /** Defaults to https://jev-ai.pro/api */
  baseUrl?: string;
  /** Defaults to jev-latest. */
  model?: string;
}

export interface JevResult {
  model: string;
  answers: JevAnswers;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

const systemOneResponseSchema = z
  .object({
    answers: z.record(z.string(), z.union([z.number(), z.string()])),
    usage: z
      .object({
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const STATUS_HINTS: Record<number, string> = {
  401: "bad API key",
  402: "no credits",
  422: "invalid request",
  429: "rate limited (300 RPM)",
  502: "upstream failure (not billed)",
  504: "upstream timeout (not billed)",
};

export async function callSystemOne(
  state: unknown,
  questions: JevQuestions,
  opts: JevOptions,
): Promise<JevResult> {
  const baseUrl = (opts.baseUrl ?? "https://jev-ai.pro/api").replace(/\/$/, "");
  const model = opts.model ?? "jev-latest";
  const res = await fetch(`${baseUrl}/v1/systemone`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      state: typeof state === "string" ? state : JSON.stringify(state),
      model,
      questions,
    }),
  });
  if (!res.ok) {
    const hint = STATUS_HINTS[res.status] ?? "unknown";
    throw new Error(`jev request failed (${res.status} ${hint}): ${await res.text()}`);
  }
  const data = systemOneResponseSchema.parse(await res.json());
  return { model, answers: data.answers, usage: data.usage };
}

/** Balance in credits. Free credits are spent first at 1 credit/call. */
export async function getJevCredits(apiKey: string, baseUrl?: string): Promise<number> {
  const base = (baseUrl ?? "https://jev-ai.pro/api").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/credits`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`jev credits request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { credits?: number };
  return data.credits ?? 0;
}

export async function listJevModels(apiKey: string, baseUrl?: string): Promise<string[]> {
  const base = (baseUrl ?? "https://jev-ai.pro/api").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`jev models request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { models?: string[] } | string[];
  return Array.isArray(data) ? data : (data.models ?? []);
}

/** Env keys that steer the jev System One integration. */
export interface JevEnv {
  JEV_API_KEY?: string;
  JEV_BASE_URL?: string;
  JEV_MODEL?: string;
}

/** Key present -> options; absent -> null (feature disabled). Unlike
 *  getLlmFromEnv there is deliberately no mock fallback: a fake classifier
 *  answer is worse than no call, so callers must gate on null. */
export function getJevFromEnv(env: Record<string, string | undefined>): JevOptions | null {
  if (!env.JEV_API_KEY) return null;
  return {
    apiKey: env.JEV_API_KEY,
    baseUrl: env.JEV_BASE_URL,
    model: env.JEV_MODEL,
  };
}
