import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok with build identity", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("issue-pilot-web");
    expect(typeof body.gitSha).toBe("string");
    expect(body.gitSha.length).toBeGreaterThan(0);
    expect(["live", "mock"]).toContain(body.llmMode);
  });
});
