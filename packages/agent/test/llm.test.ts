import { afterEach, describe, expect, it, vi } from "vitest";
import { createArkResponsesClient, getLlmFromEnv } from "../src/llm";

afterEach(() => {
  vi.unstubAllGlobals();
});

function arkResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      id: "resp_1",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
    }),
    { status: 200 },
  );
}

describe("createArkResponsesClient", () => {
  it("POSTs /responses and extracts output_text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(arkResponse('{"category":"docs"}'));
    vi.stubGlobal("fetch", fetchMock);
    const client = createArkResponsesClient({
      apiKey: "k",
      baseUrl: "https://ark.example/api/v3/",
      model: "m1",
      responseFormat: { type: "json_object" },
    });
    const text = await client.complete("prompt");
    expect(text).toContain("docs");
    const call = fetchMock.mock.calls.at(0);
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("https://ark.example/api/v3/responses");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("m1");
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe("json_object");
  });

  it("surfaces http errors with the body for diagnosability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":{}}', { status: 401 })),
    );
    const client = createArkResponsesClient({
      apiKey: "k",
      model: "m",
      responseFormat: { type: "json_object" },
    });
    await expect(client.complete("p")).rejects.toThrow(/401/);
  });
});

describe("getLlmFromEnv (responses hardcoded)", () => {
  it("always uses the Ark Responses client with json_schema from the triage contract", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        arkResponse('{"category":"docs","severity":"low","labels":["x"],"summary":"s"}'),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = getLlmFromEnv({
      OPENAI_API_KEY: "k",
      OPENAI_BASE_URL: "https://ark.cn-beijing.volces.com/api/plan/v3",
      TRIAGE_MODEL: "ark-code-latest",
    });
    await client.complete("p");
    const call = fetchMock.mock.calls.at(0);
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/plan/v3/responses");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.schema.properties.category).toBeDefined();
    expect(body.store).toBe(false);
  });

  it("falls back to the plan gateway when base URL is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(arkResponse('{"category":"chore"}'));
    vi.stubGlobal("fetch", fetchMock);
    const client = getLlmFromEnv({ OPENAI_API_KEY: "k" });
    await client.complete("p");
    const call = fetchMock.mock.calls.at(0);
    if (!call) throw new Error("fetch was not called");
    expect(call[0]).toBe("https://ark.cn-beijing.volces.com/api/plan/v3/responses");
  });
});
