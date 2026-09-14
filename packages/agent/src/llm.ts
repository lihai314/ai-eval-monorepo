/**
 * The one seam between our code and the LLM world. Everything above this
 * interface is deterministic and testable; swapping providers (or the future
 * Vercel AI SDK adapter) means implementing this interface once.
 */
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
}

/** Key present -> real client; absent -> mock. Keeps P0 pipeline runnable
 *  while P1 can turn on real inference purely via env. The parameter is a
 *  plain string record so `process.env` is assignable without a cast. */
export function getLlmFromEnv(env: Record<string, string | undefined>): LlmClient {
  if (!env.OPENAI_API_KEY) {
    return createMockClient();
  }
  return createOpenAiCompatibleClient({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.TRIAGE_MODEL ?? "gpt-4o-mini",
  });
}
