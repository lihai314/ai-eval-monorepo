import { describe, expect, it } from "vitest";
import {
  buildTriagePrompt,
  createMockClient,
  getLlmFromEnv,
  type LlmClient,
  TriageParseError,
  triageIssue,
} from "../src";

const request = { issueNumber: 42, title: "app crashes on startup", body: "stack trace..." };

function fakeLlm(model: string, reply: string): LlmClient {
  return { model, complete: async () => reply };
}

describe("buildTriagePrompt", () => {
  it("carries the boundary rules that fixed the 2/14 misclassifications", () => {
    const prompt = buildTriagePrompt({ issueNumber: 1, title: "t", body: "b" });
    expect(prompt).toContain("Stack traces alone do");
    expect(prompt).toContain("even if the reporter suspects a bug");
    expect(prompt).toContain("Chinese or English");
  });
});

describe("triageIssue", () => {
  it("parses a valid model response into a TriageResult", async () => {
    const llm = fakeLlm(
      "fake",
      'Sure! {"category":"bug","severity":"critical","labels":["crash","startup"],"summary":"Crash at startup."}',
    );
    const result = await triageIssue(request, llm);
    expect(result.category).toBe("bug");
    expect(result.labels).toContain("crash");
  });

  it("throws TriageParseError on non-JSON output", async () => {
    await expect(triageIssue(request, fakeLlm("fake", "looks like a bug to me"))).rejects.toThrow(
      TriageParseError,
    );
  });

  it("throws TriageParseError when schema validation fails", async () => {
    const bad = '{"category":"wontfix","severity":"low","labels":["x"],"summary":"ok"}';
    await expect(triageIssue(request, fakeLlm("fake", bad))).rejects.toThrow(TriageParseError);
  });

  it("works end-to-end with the mock client", async () => {
    const result = await triageIssue(request, createMockClient());
    expect(result.category).toBe("chore");
  });
});

describe("getLlmFromEnv", () => {
  it("falls back to the mock client when no API key is set", () => {
    expect(getLlmFromEnv({}).model).toBe("mock");
  });

  it("uses the configured model when a key is present", () => {
    expect(getLlmFromEnv({ OPENAI_API_KEY: "k", TRIAGE_MODEL: "m-x" }).model).toBe("m-x");
  });
});
