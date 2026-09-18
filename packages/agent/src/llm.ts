/**
 * The one seam between our code and the LLM world. Everything above this
 * interface is deterministic and testable; swapping providers (or the future
 * Vercel AI SDK adapter) means implementing this interface once.
 */

import { triageResultSchema } from "@ai-eval/shared";
import { z } from "zod";

export interface LlmClient {
  /** Model identifier reported to monitoring/eval so we know what produced a result. */
  readonly model: string;
  complete(prompt: string): Promise<string>;
}

export interface OpenAiCompatibleOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

/** Minimal OpenAI-compatible chat client. No SDK dependency on purpose: the
 *  pipeline must run before we decide on a framework for P1. */
export function createOpenAiCompatibleClient(opts: OpenAiCompatibleOptions): LlmClient {
  const baseUrl = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  return {
    model: opts.model,
    async complete(prompt: string): Promise<string> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
        }),
      });
      if (!res.ok) {
        throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("LLM returned no content");
      }
      return content;
    },
  };
}

/** Volcengine Ark Responses API client (POST /v3/responses). Non-streaming,
 *  store:false — verdicts live in our own DB, not Ark's. The json_schema
 *  response format makes the model emit schema-conforming JSON directly,
 *  removing the regex-extract + retry path of chat completions. */
export interface ArkResponsesOptions extends OpenAiCompatibleOptions {
  /** `text.format` body — e.g. json_schema for strict structured output. */
  responseFormat: Record<string, unknown>;
}

export function createArkResponsesClient(opts: ArkResponsesOptions): LlmClient {
  const baseUrl = (opts.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  return {
    model: opts.model,
    async complete(prompt: string): Promise<string> {
      const res = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          input: prompt,
          temperature: 0,
          store: false,
          text: { format: opts.responseFormat },
        }),
      });
      if (!res.ok) {
        throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as {
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      };
      const message = data.output?.find((o) => o.type === "message");
      const text = message?.content?.find((c) => c.type === "output_text")?.text;
      if (typeof text !== "string") {
        throw new Error("LLM response contained no output_text");
      }
      return text;
    },
  };
}

/** Deterministic stand-in used in tests and in deployments without an API key,
 *  so the pipeline (deploy/smoke) never depends on a live LLM. */
export function createMockClient(): LlmClient {
  return {
    model: "mock",
    async complete(prompt: string): Promise<string> {
      return JSON.stringify({
        category: "chore",
        severity: "low",
        labels: ["needs-triage"],
        summary: `mock: ${prompt.slice(0, 40)}`,
      });
    },
  };
}

/** Env keys that steer the triage LLM. */
export interface LlmEnv {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  TRIAGE_MODEL?: string;
  /** "responses" -> Ark Responses API client; anything else -> chat completions. */
  LLM_PROTOCOL?: string;
}

/** Key present -> real client; absent -> mock. Keeps P0 pipeline runnable
 *  while P1 can turn on real inference purely via env. The parameter is a
 *  plain string record so `process.env` is assignable without a cast. */
export function getLlmFromEnv(env: Record<string, string | undefined>): LlmClient {
  if (!env.OPENAI_API_KEY) {
    return createMockClient();
  }
  const opts = {
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.TRIAGE_MODEL ?? "gpt-4o-mini",
  };
  if (env.LLM_PROTOCOL === "responses") {
    return createArkResponsesClient({
      ...opts,
      responseFormat: {
        type: "json_schema",
        name: "triage_result",
        schema: z.toJSONSchema(triageResultSchema),
        strict: true,
      },
    });
  }
  return createOpenAiCompatibleClient(opts);
}
