import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../../app/api/triage/route";

const originalKey = process.env.OPENAI_API_KEY;
const originalToken = process.env.TRIAGE_TOKEN;

function postJson(payload: unknown): Request {
  return new Request("http://localhost/api/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalKey;
  }
  if (originalToken === undefined) {
    delete process.env.TRIAGE_TOKEN;
  } else {
    process.env.TRIAGE_TOKEN = originalToken;
  }
});

describe("POST /api/triage", () => {
  it("rejects malformed requests with 400 and field details", async () => {
    const res = await POST(postJson({ issueNumber: -1, title: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid triage request");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects non-JSON bodies with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/triage", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("enforces TRIAGE_TOKEN when configured", async () => {
    process.env.TRIAGE_TOKEN = "tri-secret";
    const payload = { issueNumber: 8, title: "login broken", body: "500" };

    expect((await POST(postJson(payload))).status).toBe(401);

    const ok = await POST(
      new Request("http://localhost/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer tri-secret" },
        body: JSON.stringify(payload),
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("returns a structured result (mock LLM when no key configured)", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await POST(postJson({ issueNumber: 7, title: "docs typo", body: "recieve" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe("mock");
    expect(["bug", "feature", "docs", "question", "chore"]).toContain(body.result.category);
    expect(Array.isArray(body.result.labels)).toBe(true);
  });
});
