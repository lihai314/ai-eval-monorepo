import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../../app/api/corrections/route";

const originalSecret = process.env.CORRECTION_SECRET;

function postJson(authorization?: string): Request {
  return new Request("http://localhost/api/corrections", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({ issueNumber: 1, labels: ["bug"] }),
  });
}

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CORRECTION_SECRET;
  } else {
    process.env.CORRECTION_SECRET = originalSecret;
  }
});

describe("POST /api/corrections", () => {
  it("fails closed when CORRECTION_SECRET is not configured", async () => {
    delete process.env.CORRECTION_SECRET;
    const res = await POST(postJson());
    expect(res.status).toBe(503);
  });

  it("rejects a request without the shared secret", async () => {
    process.env.CORRECTION_SECRET = "s3cret";
    const res = await POST(postJson("Bearer wrong"));
    expect(res.status).toBe(401);
  });
});
