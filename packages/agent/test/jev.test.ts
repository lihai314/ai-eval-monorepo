import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callSystemOne,
  getJevCredits,
  getJevFromEnv,
  type JevQuestions,
  listJevModels,
} from "../src";

afterEach(() => {
  vi.unstubAllGlobals();
});

function systemOneResponse(answers: unknown, usage?: unknown): Response {
  return new Response(JSON.stringify({ answers, usage }), { status: 200 });
}

const questions: JevQuestions = {
  is_urgent: { type: "noul", instructions: "Does this convey urgency?" },
  department: {
    type: "choice",
    instructions: "Which team should handle this?",
    criteria: { billing: "Payments", technical: "Bugs" },
  },
};

describe("callSystemOne", () => {
  it("POSTs state/questions to /api/v1/systemone with Bearer auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        systemOneResponse(
          { is_urgent: 0.9, department: "billing" },
          { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callSystemOne("Help! payouts failing", questions, {
      apiKey: "k",
      baseUrl: "https://jev-ai.pro/api/",
      model: "jev-latest",
    });

    const [url, init] = fetchMock.mock.calls.at(0) as [string, RequestInit];
    expect(url).toBe("https://jev-ai.pro/api/v1/systemone");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    const body = JSON.parse(init.body as string);
    expect(body.state).toBe("Help! payouts failing");
    expect(body.model).toBe("jev-latest");
    expect(body.questions.is_urgent.type).toBe("noul");
    expect(result.answers.is_urgent).toBe(0.9);
    expect(result.usage?.total_tokens).toBe(150);
  });

  it("serializes a non-string state as JSON and defaults baseUrl/model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(systemOneResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await callSystemOne({ issueNumber: 7, body: "x" }, questions, { apiKey: "k" });

    const [, init] = fetchMock.mock.calls.at(0) as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.state).toBe(JSON.stringify({ issueNumber: 7, body: "x" }));
    expect(body.model).toBe("jev-latest");
    const [url] = fetchMock.mock.calls.at(0) as [string];
    expect(url).toBe("https://jev-ai.pro/api/v1/systemone");
  });

  it("maps http errors to actionable hints", async () => {
    const cases: Array<[number, RegExp]> = [
      [401, /bad API key/],
      [402, /no credits/],
      [422, /invalid request/],
      [429, /rate limited/],
    ];
    for (const [status, re] of cases) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
      await expect(callSystemOne("s", questions, { apiKey: "k" })).rejects.toThrow(re);
      vi.unstubAllGlobals();
    }
  });

  it("rejects a response whose answers are not number|string", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(systemOneResponse({ is_urgent: true })));
    await expect(callSystemOne("s", questions, { apiKey: "k" })).rejects.toThrow();
  });
});

describe("getJevCredits", () => {
  it("GETs /api/v1/credits and returns the balance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ credits: 12 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getJevCredits("k", "https://jev-ai.pro/api")).toBe(12);
    const [url, init] = fetchMock.mock.calls.at(0) as [string, RequestInit];
    expect(url).toBe("https://jev-ai.pro/api/v1/credits");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("throws on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(getJevCredits("k")).rejects.toThrow(/401/);
  });
});

describe("listJevModels", () => {
  it("handles a bare array response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(["jev-latest"])));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listJevModels("k")).toEqual(["jev-latest"]);
  });

  it("handles an object response with models", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ models: ["a", "b"] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listJevModels("k", "https://jev-ai.pro/api")).toEqual(["a", "b"]);
  });
});

describe("getJevFromEnv", () => {
  it("returns null without a key (feature disabled)", () => {
    expect(getJevFromEnv({})).toBeNull();
    expect(getJevFromEnv({ JEV_BASE_URL: "https://jev-ai.pro/api" })).toBeNull();
  });

  it("returns options from env when the key is present", () => {
    expect(
      getJevFromEnv({
        JEV_API_KEY: "k",
        JEV_BASE_URL: "https://jev-ai.pro/api",
        JEV_MODEL: "jev-preview",
      }),
    ).toEqual({ apiKey: "k", baseUrl: "https://jev-ai.pro/api", model: "jev-preview" });
  });
});
